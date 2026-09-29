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

    // Apache only; nginx ignores .htaccess, so on nginx the extension allowlist stays the real
    // control and a Content-Security-Policy, if wanted, must go in the server config. nosniff is
    // safe to force here (it never breaks a correctly-typed asset) and stops a mistyped upload
    // from being sniffed into an executable type. A blanket CSP is deliberately NOT set: these
    // are real single-page apps that must run their own JS, so any useful policy is app-specific
    // and belongs in the app's own document, not a directory-wide rule that would break them.
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
        <IfModule mod_headers.c>
        Header set X-Content-Type-Options "nosniff"
        </IfModule>
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

    // The '/'-joined relative path of one deployed asset, or null when the app has none. Unlike
    // listAssets(), it hashes nothing and stops at the first file: for a caller that only needs
    // a single asset to probe (AppsDiagnostics), building the full manifest would scan and
    // sha256 every bundle file on each call.
    public function firstAssetPath(string $name): ?string
    {
        if (!self::isValidAppName($name)) {
            return null;
        }

        $appPath = $this->appPath($name);
        if (!is_dir($appPath)) {
            return null;
        }

        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($appPath, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($files as $file) {
            if ($file->isFile()) {
                return str_replace(DIRECTORY_SEPARATOR, '/', substr($file->getPathname(), strlen($appPath)));
            }
        }

        return null;
    }

    // Confirms an asset path physically resolves to something inside the apps root, following
    // any symlink in its existing prefix (a symlink planted by another vector could otherwise
    // point a valid-looking, '..'-free path outside the sandbox). Works for a path that does not
    // exist yet (a fresh write): it resolves the nearest existing ancestor, which is enough
    // because ASSET_PATH_PATTERN already forbids '..', so no deeper segment can climb back out.
    // Shared by read/write/removeAsset so the containment guarantee lives in one place, behind
    // the pattern and extension allowlist, instead of only on the read path.
    private function assertInsideRoot(string $absPath): bool
    {
        $root = realpath($this->path);
        if ($root === false) {
            // The apps root does not exist yet (fresh install / first write): there is nothing
            // planted to symlink through, and ASSET_PATH_PATTERN already keeps the path inside
            // it lexically. The write's dumpFile() creates the tree fresh, so allow it.
            return true;
        }

        $existing = $absPath;
        while (!file_exists($existing)) {
            $parent = \dirname($existing);
            if ($parent === $existing) {
                return false; // reached the filesystem root without finding an existing ancestor
            }
            $existing = $parent;
        }

        $real = realpath($existing);

        return $real !== false && ($real === $root || str_starts_with($real, $root . DIRECTORY_SEPARATOR));
    }

    public function readAsset(string $name, string $relPath): ?string
    {
        if (!self::isValidAppName($name) || !self::isValidAssetPath($relPath)) {
            return null;
        }

        // Confirm the file resolves inside the apps root before touching it: neither the name
        // nor the path is trusted to be traversal-free just because it matched a pattern.
        $absPath = $this->assetPath($name, $relPath);
        if (!is_file($absPath) || !$this->assertInsideRoot($absPath)) {
            return null;
        }

        // Local file confirmed inside wp-content/loopress/apps/, not a remote URL.
        $contents = file_get_contents($absPath); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

        return $contents !== false ? $contents : null;
    }

    public function writeAsset(string $name, string $relPath, string $bytes): void
    {
        $absPath = $this->assetPath($name, $relPath);
        if (!self::isValidAppName($name) || !self::isValidAssetPath($relPath) || !$this->assertInsideRoot($absPath)) {
            throw new \InvalidArgumentException(esc_html("Refusing to write unsafe asset path: {$name}/{$relPath}"));
        }

        try {
            // dumpFile() writes to a temp file then renames: a concurrent front-end request
            // reading the same asset never sees a half-written file.
            $this->filesystem->dumpFile($absPath, $bytes);
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
        if (is_file($path) && $this->assertInsideRoot($path)) {
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
