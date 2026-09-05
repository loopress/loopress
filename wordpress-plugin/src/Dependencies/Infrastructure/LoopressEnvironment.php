<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Infrastructure;

use Loopress\Infrastructure\DirectoryGuard;
use Symfony\Component\Filesystem\Exception\IOExceptionInterface;
use Symfony\Component\Filesystem\Filesystem;

class LoopressEnvironment
{
    private string $loopressDir;
    private bool $initialized = false;
    private bool $libAutoloadNeedsDump = false;
    private Filesystem $filesystem;

    public function __construct()
    {
        $this->loopressDir = WP_CONTENT_DIR . '/loopress/';
        $this->filesystem  = new Filesystem();
    }

    // The server runs Composer with --working-dir set to wp-content/loopress/, so installer-paths
    // climb one level out of it to land plugins/themes in their usual wp-content/ locations.
    private const WPACKAGIST_URL   = 'https://wpackagist.org';
    private const INSTALLERS       = 'composer/installers';
    private const INSTALLER_PATHS  = [
        '../plugins/{$name}/' => ['type:wordpress-plugin'],
        '../themes/{$name}/'  => ['type:wordpress-theme'],
    ];

    public function getLoopressDir(): string
    {
        return $this->loopressDir;
    }

    // Merges the WPackagist + composer/installers scaffold into a composer.json array, leaving
    // everything else untouched. Returns the same array unchanged when nothing was missing, so
    // callers can cheaply detect whether a rewrite is needed.
    /**
     * @param array<string, mixed> $json
     * @return array<string, mixed>
     */
    public function applyScaffold(array $json): array
    {
        $repositories = $json['repositories'] ?? [];
        $hasWpackagist = false;
        foreach ((array) $repositories as $repo) {
            if (is_array($repo) && ($repo['url'] ?? null) === self::WPACKAGIST_URL) {
                $hasWpackagist = true;
                break;
            }
        }

        if (!$hasWpackagist) {
            $repositories[]        = ['type' => 'composer', 'url' => self::WPACKAGIST_URL];
            $json['repositories']  = $repositories;
        }

        // Only require composer/installers when `require` actually needs it: a wpackagist-*
        // package, or a caller that already required it directly. Requiring it unconditionally
        // installed (and in-process `include`d, as a Composer plugin) composer/installers on
        // every single push, even a plain-library one with no plugins/themes involved.
        if (self::requireNeedsInstallers($json['require'] ?? []) && ($json['require'][self::INSTALLERS] ?? null) === null) {
            $json['require'][self::INSTALLERS] = '^2.0';
        }

        // Merge, don't replace: a client-supplied composer.json (via `lps composer push`) may
        // carry installer-paths for other package types, and those must survive. Our own two
        // entries win on their keys.
        $installerPaths = $json['extra']['installer-paths'] ?? [];
        $mergedPaths    = array_merge((array) $installerPaths, self::INSTALLER_PATHS);
        if ($installerPaths !== $mergedPaths) {
            $json['extra']['installer-paths'] = $mergedPaths;
        }

        // composer/installers is itself a Composer plugin; Composer 2.2+ refuses to run any
        // plugin that isn't explicitly trusted when running non-interactively, which every
        // server-side sync does.
        if (($json['config']['allow-plugins'][self::INSTALLERS] ?? null) !== true) {
            $json['config']['allow-plugins'][self::INSTALLERS] = true;
        }

        return $json;
    }

    /** @param array<string, mixed> $requireMap */
    private static function requireNeedsInstallers(array $requireMap): bool
    {
        foreach (array_keys($requireMap) as $name) {
            $name = (string) $name;
            if ($name === self::INSTALLERS || str_starts_with($name, 'wpackagist-')) {
                return true;
            }
        }

        return false;
    }

    // `wpackagist-plugin/foo` -> wp-content/plugins/foo, `wpackagist-theme/bar` -> wp-content/themes/bar.
    // The slug is client-supplied (it comes straight from the sync intent), so it is validated
    // as a single safe path segment before it is appended: a traversal slug like `../../foo`
    // must not steer removeManagedDir() outside wp-content/plugins/ or wp-content/themes/.
    public function managedPackageDir(string $vendorName): ?string
    {
        foreach (['wpackagist-plugin/' => '/plugins/', 'wpackagist-theme/' => '/themes/'] as $prefix => $subdir) {
            if (!str_starts_with($vendorName, $prefix)) {
                continue;
            }

            $slug = substr($vendorName, strlen($prefix));
            if ($slug === '' || $slug !== basename($slug) || str_contains($slug, '\\') || str_starts_with($slug, '.')) {
                return null;
            }

            return WP_CONTENT_DIR . $subdir . $slug;
        }

        return null;
    }

    public function managedDirExists(string $vendorName): bool
    {
        $dir = $this->managedPackageDir($vendorName);
        return $dir !== null && is_dir($dir);
    }

    // A force-takeover moves the existing directory here instead of deleting it outright, so a
    // Composer run that's supposed to replace it but fails (network blip, a version that
    // doesn't exist, the in-process class-loading collision applyScaffold() works around
    // above) doesn't leave the site with neither the old files nor the new ones. Lives under
    // wp-content/loopress/, not wp-content/plugins|themes/, so WordPress's plugin/theme header
    // scan never picks up a staged copy while it's in flight.
    private function stagingDir(): string
    {
        $dir = $this->loopressDir . 'staging/';
        if (!is_dir($dir)) {
            wp_mkdir_p($dir);
        }

        DirectoryGuard::writeHtaccessIfMissing($dir, self::VENDOR_HTACCESS);

        return $dir;
    }

    public function stageManagedDir(string $vendorName): ?string
    {
        $dir = $this->managedPackageDir($vendorName);
        if ($dir === null || !is_dir($dir)) {
            return null;
        }

        $staged = $this->stagingDir() . basename($dir) . '-' . uniqid();
        $this->filesystem->rename($dir, $staged);

        return $staged;
    }

    // Moves a staged directory back to its live path. A failed Composer run may have gotten
    // as far as creating a partial extraction at that path before it errored out, so that's
    // cleared first, the rename below would otherwise collide with it.
    public function restoreStagedDir(string $vendorName, string $stagedPath): void
    {
        if (!is_dir($stagedPath)) {
            return;
        }

        $dir = $this->managedPackageDir($vendorName);
        if ($dir === null) {
            return;
        }

        if (is_dir($dir)) {
            $this->filesystem->remove($dir);
        }

        $this->filesystem->rename($stagedPath, $dir);
    }

    public function discardStagedDir(string $stagedPath): void
    {
        if (is_dir($stagedPath)) {
            $this->filesystem->remove($stagedPath);
        }
    }

    // Idempotent per instance: runs its filesystem checks at most once per request,
    // and only on code paths that actually touch the Composer environment (REST,
    // admin page), never on regular front-end page loads.
    public function ensureInitialized(): void
    {
        if ($this->initialized) {
            return;
        }

        $this->initialized = true;

        if (!is_dir($this->loopressDir)) {
            wp_mkdir_p($this->loopressDir);
        }

        $this->ensureLibDir();
        $this->ensureVendorDir();

        if (!file_exists($this->loopressDir . 'composer.json')) {
            $this->writeComposerJson($this->applyScaffold([
                'name'        => 'loopress/site-dependencies',
                'description' => 'Site-wide dependencies managed by Loopress Full',
                'version'     => '0.0.0',
                'autoload'    => ['psr-4' => ['LoopressLib\\' => 'lib/']],
                'config'      => [
                    'vendor-dir' => 'vendor',
                    'platform'   => ['php' => PHP_VERSION],
                ],
            ]));
            return;
        }

        $json         = $this->readComposerJson();
        $needsRewrite = false;

        // Ensure config.platform.php matches the running PHP; prevents installing
        // packages whose requirements exceed the actual server version.
        if (($json['config']['platform']['php'] ?? null) !== PHP_VERSION) {
            $json['config']['platform']['php'] = PHP_VERSION;
            $needsRewrite = true;
        }

        // Migrate a composer.json created before Loopress managed WordPress.org plugins/themes
        // through it: add the WPackagist repository, composer/installers, the installer-paths
        // that land plugins/themes in wp-content/, and the plugin-trust entry Composer 2.2+
        // needs to run composer/installers non-interactively. Same "flag, don't run" reasoning
        // as the autoload migration below: the caller with a ComposerRunner reinstalls.
        $scaffolded = $this->applyScaffold($json);
        if ($scaffolded !== $json) {
            $json         = $scaffolded;
            $needsRewrite = true;
        }

        // Migrates a site whose composer.json (and vendor/) already existed before lib/ was
        // introduced. Patching composer.json alone has zero runtime effect on an
        // already-generated autoloader: Composer's ClassLoader only ever reads the files
        // `dump-autoload` writes to vendor/composer/, never composer.json itself. Flagged
        // here rather than run directly: LoopressEnvironment has no ComposerRunner (it would
        // create a constructor cycle, ComposerRunner already depends on LoopressEnvironment),
        // so the actual dump-autoload is left to a caller that has one, see
        // needsLibAutoloadDump() and ComposerService::ensureInitialized().
        if (($json['autoload']['psr-4']['LoopressLib\\'] ?? null) !== 'lib/') {
            $json['autoload']['psr-4']['LoopressLib\\'] = 'lib/';
            $needsRewrite               = true;
            $this->libAutoloadNeedsDump = true;
        }

        if ($needsRewrite) {
            $this->writeComposerJson($json);
        }
    }

    // "Take" semantics (reads and clears in one step) so a caller that polls this after every
    // ensureInitialized() call, ComposerService::ensureInitialized() does, never triggers more
    // than one dump-autoload for a single migration, even if called several times per request.
    public function needsLibAutoloadDump(): bool
    {
        $needsDump                  = $this->libAutoloadNeedsDump;
        $this->libAutoloadNeedsDump = false;
        return $needsDump;
    }

    // Called back by ComposerService when its dump-autoload attempt actually fails, so the
    // flag it just consumed via needsLibAutoloadDump() isn't silently lost: a later call
    // within the same request (or a future caller sharing this instance) sees the migration
    // as still pending instead of assuming it already succeeded.
    public function retryLibAutoloadDump(): void
    {
        $this->libAutoloadNeedsDump = true;
    }

    // Sibling of api/ (see ApiDirectory::ensureExists(), same anti-listing rationale), never
    // scanned for routing: just a place for code shared between api/ files and snippets via
    // the LoopressLib\ autoload prefix above.
    private function ensureLibDir(): void
    {
        $libDir = $this->loopressDir . 'lib/';
        if (!is_dir($libDir)) {
            wp_mkdir_p($libDir);
        }

        DirectoryGuard::writeIndexIfMissing($libDir);
    }

    // wp-content/loopress/ sits under the public webroot, so vendor/ needs the same defence as
    // the plugin's own bundled vendor/ (see wordpress-plugin/scripts/build-flavor.cjs): without
    // this, vendor/composer/installed.json hands the full dependency tree to anyone who requests
    // it. Written up front (before the first `composer install` even runs) so the directory is
    // never briefly unprotected. Apache/LiteSpeed only, same caveat as AppsDirectory::HTACCESS:
    // nginx ignores .htaccess and needs an equivalent server-block rule; ComposerService's
    // diagnostics check verifies from the outside whether this actually took effect.
    private function ensureVendorDir(): void
    {
        $vendorDir = $this->loopressDir . 'vendor/';
        if (!is_dir($vendorDir)) {
            wp_mkdir_p($vendorDir);
        }

        DirectoryGuard::writeIndexIfMissing($vendorDir);
        DirectoryGuard::writeHtaccessIfMissing($vendorDir, self::VENDOR_HTACCESS);
    }

    private const VENDOR_HTACCESS = <<<'HTACCESS'
        # Loopress: bundled Composer dependencies, not meant to be reached over HTTP.
        <IfModule mod_authz_core.c>
          Require all denied
        </IfModule>
        <IfModule !mod_authz_core.c>
          Order allow,deny
          Deny from all
        </IfModule>

        HTACCESS;

    public function getAutoloadPath(): ?string
    {
        $path = $this->loopressDir . 'vendor/autoload.php';
        return file_exists($path) ? $path : null;
    }

    /** @return array<string, mixed> */
    public function readComposerJson(): array
    {
        $path = $this->loopressDir . 'composer.json';
        if (!file_exists($path)) {
            return [];
        }

        // Local file under our own working directory, not a remote URL: wp_remote_get() doesn't apply here.
        $contents = file_get_contents($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        if ($contents === false) {
            throw new \RuntimeException(esc_html("Failed to read composer.json from {$path}"));
        }

        $data = json_decode($contents, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('composer.json contains invalid JSON: ' . esc_html(json_last_error_msg()));
        }

        return $data ?? [];
    }

    /** @param array<string, mixed> $json */
    public function writeComposerJson(array $json): void
    {
        $this->ensureInitialized();

        // ensureInitialized() may have just migrated this key onto the file we're about to
        // overwrite below (fresh site, or one predating lib/), via its own nested
        // writeComposerJson() call a few lines up. Reassert it here so a caller writing its
        // own full composer.json (ComposerService::sync(), or the composer init scaffold)
        // can't silently undo that migration by immediately overwriting the file again.
        // Unconditional, not ??=: ComposerService::sync() passes this a client-supplied
        // composer.json verbatim (`lps composer push`), and ??= only guards against the key
        // being absent, not against the client setting it to something other than 'lib/'.
        $json['autoload']['psr-4']['LoopressLib\\'] = 'lib/';

        $encoded = wp_json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            throw new \RuntimeException('Failed to encode composer.json: ' . esc_html(json_last_error_msg()));
        }

        // dumpFile() writes to a temp file then renames, so a reader (or a crash mid-write)
        // never sees a partially-written composer.json.
        try {
            $this->filesystem->dumpFile($this->loopressDir . 'composer.json', $encoded);
        } catch (IOExceptionInterface $e) {
            throw new \RuntimeException(esc_html("Failed to write composer.json to {$this->loopressDir}: " . $e->getMessage()));
        }
    }

    public function readComposerJsonRaw(): ?string
    {
        return $this->readLoopressFile('composer.json');
    }

    public function readComposerLock(): ?string
    {
        return $this->readLoopressFile('composer.lock');
    }

    private function readLoopressFile(string $filename): ?string
    {
        $path = $this->loopressDir . $filename;
        if (!file_exists($path)) {
            return null;
        }

        // Local file under our own working directory, not a remote URL: wp_remote_get() doesn't apply here.
        $contents = file_get_contents($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        return $contents !== false ? $contents : null;
    }

    public function writeComposerLock(string $contents): void
    {
        $this->ensureInitialized();

        try {
            $this->filesystem->dumpFile($this->loopressDir . 'composer.lock', $contents);
        } catch (IOExceptionInterface $e) {
            throw new \RuntimeException(esc_html("Failed to write composer.lock to {$this->loopressDir}: " . $e->getMessage()));
        }
    }

    public function deleteComposerLock(): void
    {
        $path = $this->loopressDir . 'composer.lock';
        if (file_exists($path)) {
            unlink($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
        }
    }
}
