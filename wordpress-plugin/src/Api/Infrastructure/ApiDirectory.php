<?php

declare(strict_types=1);

namespace Loopress\Api\Infrastructure;

use Symfony\Component\Filesystem\Exception\IOExceptionInterface;
use Symfony\Component\Filesystem\Filesystem;

/**
 * wp-content/loopress/api/: where custom route files live on the filesystem, mirroring
 * Dependencies\Infrastructure\LoopressEnvironment's own wp-content/loopress/ directory.
 * wp-content/ is expected to be writable by the webserver, unlike the plugin's own directory.
 */
class ApiDirectory
{
    private string $path;
    private Filesystem $filesystem;

    public function __construct()
    {
        $this->path       = WP_CONTENT_DIR . '/loopress/api/';
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

        $indexFile = $this->path . 'index.php';
        if (!file_exists($indexFile)) {
            // Trivial static content, no concurrent-write concern unlike write() below: a
            // plain write is fine here, no need for dumpFile()'s atomic rename.
            file_put_contents($indexFile, "<?php\n// Silence is golden.\n"); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
        }
    }

    /**
     * @return string[] slugs: relative path without .php, e.g. ['hello', 'invoice-pdf/[order_id]']
     *   for api/hello.php and api/invoice-pdf/[order_id].php respectively.
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

            $relative = substr($file->getPathname(), strlen($this->path));
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

    // dumpFile() writes to a temp file then renames, so a concurrent rest_api_init scan
    // never reads a half-written file.
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
