<?php

declare(strict_types=1);

namespace Loopress\Blocks\Infrastructure;

use Loopress\Infrastructure\AbstractFilesDirectory;
use Loopress\Infrastructure\DirectoryGuard;
use Symfony\Component\Filesystem\Exception\IOExceptionInterface;
use Symfony\Component\Filesystem\Filesystem;

/**
 * wp-content/loopress/blocks/<slug>/: one folder per dynamic block, in WordPress's own block
 * format (block.json + render.php, plus optional style.css and view.js), registered with
 * register_block_type() by BlockLoader. A folder, not a single file like hooks/, so it doesn't
 * extend AbstractFilesDirectory: the unit of a write is the whole block, swapped in atomically.
 */
final readonly class BlocksDirectory
{
    // Fixed names, nothing else is ever written: style.css and view.js are served by the
    // webserver, so a client-chosen name could otherwise land a .php next to them.
    public const FILES = ['block.json', 'render.php', 'style.css', 'view.js'];

    // WordPress's own block name segment rule, same as the CLI's BLOCK_SEGMENT.
    private const SLUG_PATTERN = '/^[a-z][a-z0-9-]{0,63}\z/';

    // Same roles as HooksDirectory's two options: load errors are rewritten in full on every
    // request by BlockLoader, runtime errors keep the last render failure per block.
    public const LOAD_ERRORS_OPTION    = 'loopress_blocks_load_errors';
    public const RUNTIME_ERRORS_OPTION = 'loopress_blocks_runtime_errors';

    // Prepended to render.php on write, stripped on read: wp-content/ is under the webroot, and
    // a template requested directly over HTTP must not run outside WordPress. A template has no
    // declare() line to anchor FileWriter's guard on, so it goes first, closing its own tag
    // (PHP swallows the newline right after a closing tag, so the template's output is unchanged).
    public const GUARD = "<?php defined('ABSPATH') || exit; ?>\n";

    private string $path;
    private Filesystem $filesystem;

    public function __construct()
    {
        $this->path       = WP_CONTENT_DIR . '/loopress/blocks/';
        $this->filesystem = new Filesystem();
    }

    public static function isValidSlug(mixed $slug): bool
    {
        return is_string($slug) && preg_match(self::SLUG_PATTERN, $slug) === 1;
    }

    public function root(): string
    {
        return rtrim($this->path, '/');
    }

    public function blockPath(string $slug): string
    {
        return $this->path . $slug . '/';
    }

    /** @return string[] slugs of every folder holding a block.json, sorted */
    public function listSlugs(): array
    {
        if (!is_dir($this->path)) {
            return [];
        }

        $slugs = [];
        foreach (new \DirectoryIterator($this->path) as $entry) {
            $name = $entry->getFilename();
            // Staging folders start with a '.', which the slug pattern refuses.
            if ($entry->isDir() && self::isValidSlug($name) && is_file($this->blockPath($name) . 'block.json')) {
                $slugs[] = $name;
            }
        }
        sort($slugs);

        return $slugs;
    }

    /** @return array<string, string> file name => content, render.php without its guard */
    public function read(string $slug): array
    {
        if (!self::isValidSlug($slug)) {
            return [];
        }

        $files = [];
        foreach (self::FILES as $name) {
            $path = $this->blockPath($slug) . $name;
            // Local file under our own directory: a validated slug and a fixed name.
            $content = is_file($path) ? file_get_contents($path) : false; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
            if ($content !== false) {
                $files[$name] = $name === 'render.php' ? $this->unguarded($content) : $content;
            }
        }

        return $files;
    }

    // What BlockLoader stamps on a runtime error and the controller compares against, so a
    // fixed and re-pushed block stops reporting its old error.
    public function renderRevision(string $slug): ?string
    {
        $path = $this->blockPath($slug) . 'render.php';
        $hash = self::isValidSlug($slug) && is_file($path) ? hash_file('sha256', $path) : false;

        return $hash === false ? null : $hash;
    }

    /**
     * Writes the whole block into a staging folder, then swaps it in with renames, so a request
     * never sees a new block.json next to an old render.php.
     *
     * @param array<string, string> $files file name (one of FILES) => content
     */
    public function write(string $slug, array $files): void
    {
        if (!self::isValidSlug($slug)) {
            throw new \InvalidArgumentException(esc_html("Invalid block slug: {$slug}"));
        }

        $this->ensureExists();
        $suffix  = uniqid('', true);
        $staging = $this->path . ".{$slug}.tmp-{$suffix}/";
        $backup  = $this->path . ".{$slug}.old-{$suffix}/";
        $live    = $this->blockPath($slug);

        try {
            foreach ($files as $name => $content) {
                if (!in_array($name, self::FILES, true)) {
                    throw new \InvalidArgumentException(esc_html("Unsupported block file: {$name}"));
                }
                $this->filesystem->dumpFile($staging . $name, $name === 'render.php' ? self::GUARD . $content : $content);
            }

            // ponytail: no lock, two concurrent pushes of the same block can fail the second
            // rename (the push errors, nothing is lost); add flock() like AbstractFilesDirectory if it bites.
            if (is_dir($live)) {
                $this->filesystem->rename($live, $backup);
            }
            $this->filesystem->rename($staging, $live);
        } catch (IOExceptionInterface $e) {
            if (is_dir($backup) && !is_dir($live)) {
                $this->filesystem->rename($backup, $live);
            }
            $this->filesystem->remove($staging);

            throw new \RuntimeException(esc_html("Failed to write block {$slug}: " . $e->getMessage()));
        }

        $this->filesystem->remove($backup);
    }

    public function delete(string $slug): bool
    {
        if (!self::isValidSlug($slug) || !is_dir($this->blockPath($slug))) {
            return false;
        }

        $this->filesystem->remove($this->blockPath($slug));
        return true;
    }

    // Anti-listing index.php at the root only: a block folder holds no index to protect.
    public function ensureExists(): void
    {
        if (!is_dir($this->path)) {
            wp_mkdir_p($this->path);
        }

        DirectoryGuard::writeIndexIfMissing($this->path);
    }

    public static function maxFileBytes(): int
    {
        return AbstractFilesDirectory::MAX_FILE_BYTES;
    }

    private function unguarded(string $content): string
    {
        return str_starts_with($content, self::GUARD) ? substr($content, strlen(self::GUARD)) : $content;
    }
}
