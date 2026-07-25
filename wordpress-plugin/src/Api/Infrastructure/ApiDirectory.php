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

    // Directory listing is blocked by an empty index.php (defense in depth, see obsidian
    // doc "Protection contre l'accès direct au fichier"); it doesn't protect a request for a
    // specific named file, that's what FileWriter's injected ABSPATH guard is for.
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

    /** @return string[] slugs (filename without .php), e.g. ['hello', 'hello-world'] */
    public function listSlugs(): array
    {
        if (!is_dir($this->path)) {
            return [];
        }

        $files = scandir($this->path); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_read_scandir
        if ($files === false) {
            return [];
        }

        $slugs = [];
        foreach ($files as $file) {
            if ($file !== 'index.php' && str_ends_with($file, '.php')) {
                $slugs[] = substr($file, 0, -4);
            }
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
    // never reads a half-written file (see obsidian doc "Race condition à l'écriture").
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
