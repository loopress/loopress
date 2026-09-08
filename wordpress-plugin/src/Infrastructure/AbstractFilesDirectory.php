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
    // Each concrete directory overrides this with 'api', 'hooks', etc.
    protected const SUBDIR = '';

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
}
