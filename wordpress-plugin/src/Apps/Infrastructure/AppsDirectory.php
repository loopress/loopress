<?php

declare(strict_types=1);

namespace Loopress\Apps\Infrastructure;

use Loopress\Infrastructure\DirectoryGuard;
use Symfony\Component\Filesystem\Exception\IOExceptionInterface;
use Symfony\Component\Filesystem\Filesystem;

/**
 * wp-content/loopress/apps/<name>/: where built SPA bundles live on the filesystem, a
 * sibling of Api's wp-content/loopress/api/ and Dependencies' wp-content/loopress/vendor/.
 * Unlike api/ (PHP files that are require()d, never web-served, guarded by an injected
 * ABSPATH check), these files ARE served directly by the webserver, so the only thing
 * standing between a push and an uploaded webshell is isValidAssetPath()'s extension
 * allowlist. A defence-in-depth .htaccess disables PHP under apps/ for Apache; nginx has no
 * equivalent drop-in, hence the allowlist is the real control.
 */
class AppsDirectory
{
    // Mirrors Api's ApiFilesController::FILENAME_PATTERN idea (a slash-separated path of
    // safe segments, no traversal) but for asset paths, so it also carries an extension.
    private const ASSET_PATH_PATTERN = '#^(?!.*(?:^|/)\.\.?(?:/|$))[A-Za-z0-9_.\-]+(?:/[A-Za-z0-9_.\-]+)*$#';

    // Static assets a bundler emits. Deliberately excludes .php and every executable-on-the-
    // server extension: a file that lands here is reachable at a public URL and run by the
    // webserver, not by us.
    private const ALLOWED_EXTENSIONS = [
        'js', 'mjs', 'cjs', 'css', 'map', 'json', 'html', 'htm', 'txt', 'xml', 'webmanifest',
        'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp',
        'woff', 'woff2', 'ttf', 'otf', 'eot',
        'wasm', 'mp3', 'mp4', 'webm', 'ogg', 'pdf', 'csv',
    ];

    private const APP_NAME_PATTERN = '/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/';

    private string $path;
    private Filesystem $filesystem;

    public function __construct()
    {
        $this->path       = WP_CONTENT_DIR . '/loopress/apps/';
        $this->filesystem = new Filesystem();
    }

    public static function isValidAppName(string $name): bool
    {
        return preg_match(self::APP_NAME_PATTERN, $name) === 1;
    }

    public static function isValidAssetPath(string $relPath): bool
    {
        if ($relPath === '' || preg_match(self::ASSET_PATH_PATTERN, $relPath) !== 1) {
            return false;
        }

        $ext = strtolower(pathinfo($relPath, PATHINFO_EXTENSION));

        return in_array($ext, self::ALLOWED_EXTENSIONS, true);
    }

    public function appPath(string $name): string
    {
        return $this->path . $name . '/';
    }

    public function assetPath(string $name, string $relPath): string
    {
        return $this->appPath($name) . $relPath;
    }

    public function hasApp(string $name): bool
    {
        return is_dir($this->appPath($name));
    }

    /**
     * Anti-listing index.php at the apps/ root (defence in depth, same as ApiDirectory), plus
     * an Apache .htaccess that turns PHP off for the whole tree. Individual app directories
     * get NO index.php: the webserver must be free to serve their index.html.
     */
    public function ensureExists(): void
    {
        if (!is_dir($this->path)) {
            wp_mkdir_p($this->path);
        }

        DirectoryGuard::writeIndexIfMissing($this->path);
        DirectoryGuard::writeHtaccessIfMissing($this->path, self::HTACCESS);
    }

    private const HTACCESS = <<<'HTACCESS'
        # Loopress: built SPA bundles are static assets. No PHP runs here.
        <IfModule mod_php.c>
        php_flag engine off
        </IfModule>
        <IfModule mod_php7.c>
        php_flag engine off
        </IfModule>
        <FilesMatch "\.(?i:php|phtml|phar|php[0-9]|pht|phps)$">
          Require all denied
        </FilesMatch>
        HTACCESS;

    /** @return string[] app names, sorted */
    public function listAppNames(): array
    {
        if (!is_dir($this->path)) {
            return [];
        }

        $names = [];
        foreach (new \DirectoryIterator($this->path) as $entry) {
            if ($entry->isDir() && !$entry->isDot() && self::isValidAppName($entry->getFilename())) {
                $names[] = $entry->getFilename();
            }
        }
        sort($names);

        return $names;
    }

    /**
     * @return array<string, array{sha256: string, size: int}> keyed by '/'-joined relative path
     */
    public function listAssets(string $name): array
    {
        $appPath = $this->appPath($name);
        if (!is_dir($appPath)) {
            return [];
        }

        $assets = [];
        $files  = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($appPath, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($files as $file) {
            if (!$file->isFile()) {
                continue;
            }
            $hash = hash_file('sha256', $file->getPathname());
            $size = $file->getSize();
            if ($hash === false || $size === false) {
                continue;
            }
            $rel          = str_replace(DIRECTORY_SEPARATOR, '/', substr($file->getPathname(), strlen($appPath)));
            $assets[$rel] = ['sha256' => $hash, 'size' => $size];
        }
        ksort($assets);

        return $assets;
    }

    public function readAsset(string $name, string $relPath): ?string
    {
        if (!self::isValidAppName($name) || !self::isValidAssetPath($relPath)) {
            return null;
        }

        // Canonicalise, then confirm the file physically resolves to something inside the
        // apps root before touching it: neither the name nor the path is trusted to be
        // traversal-free just because it matched a pattern.
        $root = realpath($this->path);
        $real = realpath($this->assetPath($name, $relPath));
        if ($root === false || $real === false) {
            return null;
        }
        if (!is_file($real) || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) {
            return null;
        }

        // Local file confirmed inside wp-content/loopress/apps/, not a remote URL.
        $contents = file_get_contents($real); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

        return $contents !== false ? $contents : null;
    }

    public function writeAsset(string $name, string $relPath, string $bytes): void
    {
        if (!self::isValidAppName($name) || !self::isValidAssetPath($relPath)) {
            throw new \InvalidArgumentException(esc_html("Refusing to write unsafe asset path: {$name}/{$relPath}"));
        }

        try {
            // dumpFile() writes to a temp file then renames: a concurrent front-end request
            // reading the same asset never sees a half-written file.
            $this->filesystem->dumpFile($this->assetPath($name, $relPath), $bytes);
        } catch (IOExceptionInterface $e) {
            throw new \RuntimeException(esc_html("Failed to write {$name}/{$relPath}: " . $e->getMessage()));
        }
    }

    public function removeAsset(string $name, string $relPath): void
    {
        if (!self::isValidAppName($name) || !self::isValidAssetPath($relPath)) {
            return;
        }
        $path = $this->assetPath($name, $relPath);
        if (is_file($path)) {
            $this->filesystem->remove($path);
        }
    }

    public function deleteApp(string $name): void
    {
        if (!self::isValidAppName($name)) {
            return;
        }
        $appPath = $this->appPath($name);
        if (is_dir($appPath)) {
            $this->filesystem->remove($appPath);
        }
    }
}
