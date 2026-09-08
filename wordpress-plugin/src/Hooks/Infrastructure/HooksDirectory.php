<?php

declare(strict_types=1);

namespace Loopress\Hooks\Infrastructure;

use Loopress\Infrastructure\DirectoryGuard;
use Symfony\Component\Filesystem\Exception\IOExceptionInterface;
use Symfony\Component\Filesystem\Filesystem;

/**
 * wp-content/loopress/hooks/: where custom action/filter files live on the filesystem,
 * structurally identical to Api\Infrastructure\ApiDirectory (same reasoning throughout, see
 * that class), just a different subdirectory and no bracketed dynamic-segment slugs: a hook
 * name is never a URL path, so there's nothing here for a segment like '[order_id]' to mean.
 */
class HooksDirectory
{
    // Same reasoning as ApiDirectory::LOAD_ERRORS_OPTION: written by HookLoader at the end of
    // every loadAndRegister() pass, overwritten in full each time, read by HookFilesController
    // to annotate the CLI/admin view with per-file load failures.
    public const LOAD_ERRORS_OPTION = 'loopress_hooks_load_errors';

    private string $path;
    private Filesystem $filesystem;

    public function __construct()
    {
        $this->path       = WP_CONTENT_DIR . '/loopress/hooks/';
        $this->filesystem = new Filesystem();
    }

    public function filePath(string $slug): string
    {
        return $this->path . $slug . '.php';
    }

    // Directory listing is blocked by an empty index.php (defense in depth); it doesn't
    // protect a request for a specific named file, that's what FileWriter's injected ABSPATH
    // guard is for.
    public function ensureExists(): void
    {
        if (!is_dir($this->path)) {
            wp_mkdir_p($this->path);
        }

        DirectoryGuard::writeIndexIfMissing($this->path);
    }

    /** @return string[] slugs: relative path without .php, e.g. ['content-filters/the-content'] */
    public function listSlugs(): array
    {
        if (!is_dir($this->path)) {
            return [];
        }

        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($this->path, \FilesystemIterator::SKIP_DOTS)
        );

        $slugs = [];
        foreach ($files as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'php' || $file->getFilename() === 'index.php') {
                continue;
            }

            $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($file->getPathname(), strlen($this->path)));
            $slugs[]  = substr($relative, 0, -4); // strip the trailing '.php'
        }

        return $slugs;
    }

    public function read(string $slug): ?string
    {
        $path = $this->filePath($slug);
        if (!file_exists($path)) {
            return null;
        }

        $contents = file_get_contents($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        return $contents !== false ? $contents : null;
    }

    // dumpFile() writes to a temp file then renames, so a concurrent boot-time scan never
    // reads a half-written file.
    public function write(string $slug, string $content): void
    {
        $this->ensureExists();

        try {
            $this->filesystem->dumpFile($this->filePath($slug), $content);
        } catch (IOExceptionInterface $e) {
            throw new \RuntimeException(esc_html("Failed to write {$slug}.php: " . $e->getMessage()));
        }
    }
}
