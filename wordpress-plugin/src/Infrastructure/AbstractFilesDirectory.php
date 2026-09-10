<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

use Symfony\Component\Filesystem\Exception\IOExceptionInterface;
use Symfony\Component\Filesystem\Filesystem;

/**
 * A wp-content/loopress/<subdir>/ directory of single-class PHP files pushed by the CLI
 * (`lps api push`, `lps hook push`). wp-content/ is expected to be writable by the webserver,
 * unlike the plugin's own directory. Concrete subclasses only pick the subdir and expose
 * their own LOAD_ERRORS_OPTION for the loader/controller pair that reads it.
 */
abstract class AbstractFilesDirectory
{
    // Each concrete directory overrides both: SUBDIR is the wp-content/loopress/ folder name
    // and doubles as the 'api'/'hooks' label the loader and controller stamp on log lines,
    // route error strings and the tempnam() prefix. LOAD_ERRORS_OPTION is where the loader
    // records this boot's per-file failures for the controller to read back.
    public const SUBDIR = '';
    public const LOAD_ERRORS_OPTION = '';

    // Per-file ceiling. One single-class PHP route/hook file has no business being anywhere
    // near this; the point is that nothing hands token_get_all() / `php -l` / require() an
    // arbitrarily large blob (memory exhaustion is an uncatchable E_ERROR, see LP-SEC-02).
    // Enforced at push time (AbstractFilesController) and again at load time
    // (AbstractFileLoader), so a file planted straight on disk, outside the CLI, is bounded too.
    public const MAX_FILE_BYTES = 512 * 1024;

    // Last-resort guard for the whole directory: even with every file under MAX_FILE_BYTES,
    // hundreds of near-limit files would still cumulatively exhaust memory at boot. Generous
    // on purpose. A normal site never approaches it; a directory that does has almost
    // certainly been mass-populated by something other than `lps <resource> push`.
    public const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

    private string $path;
    private Filesystem $filesystem;

    public function __construct()
    {
        $this->path       = WP_CONTENT_DIR . '/loopress/' . static::SUBDIR . '/';
        $this->filesystem = new Filesystem();
    }

    public function filePath(string $slug): string
    {
        return $this->path . $slug . '.php';
    }

    // Filterable, and passed the subdir so a filter can differ between api/ and hooks/.
    public function maxFileBytes(): int
    {
        return (int) apply_filters('loopress_max_file_bytes', self::MAX_FILE_BYTES, static::SUBDIR);
    }

    public function maxTotalBytes(): int
    {
        return (int) apply_filters('loopress_max_files_total_bytes', self::MAX_TOTAL_BYTES, static::SUBDIR);
    }

    // Size of a slug's file on disk in bytes, or null if it can't be determined (missing,
    // unreadable). Kept here so the size checks in the loader and the controller both go
    // through one place rather than each reaching for @filesize() on a path they build.
    public function fileSize(string $slug): ?int
    {
        $path = $this->filePath($slug);
        if (!is_file($path)) {
            return null;
        }

        $size = @filesize($path); // phpcs:ignore WordPress.PHP.NoSilencedErrors -- a race with deletion is expected here, not a bug
        return $size === false ? null : $size;
    }

    // Directory listing is blocked by an empty index.php (defense in depth); it doesn't
    // protect a request for a specific named file, that's what FileWriter's injected ABSPATH
    // guard is for.
    public function ensureExists(): void
    {
        if (!is_dir($this->path)) {
            wp_mkdir_p($this->path);
        }

        // Trivial static content, no concurrent-write concern unlike write() below: a plain
        // write is fine here, no need for dumpFile()'s atomic rename.
        DirectoryGuard::writeIndexIfMissing($this->path);
    }

    /**
     * @return string[] slugs: relative path without .php, e.g. ['hello', 'invoice-pdf/[order_id]']
     *   for <subdir>/hello.php and <subdir>/invoice-pdf/[order_id].php respectively.
     */
    public function listSlugs(): array
    {
        if (!is_dir($this->path)) {
            return [];
        }

        // RecursiveIteratorIterator defaults to LEAVES_ONLY: intermediate directories never
        // appear as their own entry, only actual files do.
        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($this->path, \FilesystemIterator::SKIP_DOTS)
        );

        $slugs = [];
        foreach ($files as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'php' || $file->getFilename() === 'index.php') {
                continue;
            }

            // getPathname() uses the platform's directory separator ('\' on Windows); a slug
            // is always explode()d on '/', so a slug carrying '\' would be read as one single
            // segment instead of the intended nested path.
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

        // Local file under our own working directory, not a remote URL.
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

    // Removes a single deployed file. Returns false when there was nothing to remove, so the
    // controller can answer 404 rather than a misleading 200. The slug is always a value that
    // has already passed the controller's filename validation (no '.' segments, extension never
    // client-supplied), so this only ever resolves inside the resource directory.
    public function delete(string $slug): bool
    {
        $path = $this->filePath($slug);
        if (!is_file($path)) {
            return false;
        }

        $this->filesystem->remove($path);
        return true;
    }
}
