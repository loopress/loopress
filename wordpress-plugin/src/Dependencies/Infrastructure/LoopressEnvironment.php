<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Infrastructure;

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

        if (($json['require'][self::INSTALLERS] ?? null) === null) {
            $json['require'][self::INSTALLERS] = '^2.0';
        }

        if (($json['extra']['installer-paths'] ?? null) !== self::INSTALLER_PATHS) {
            $json['extra']['installer-paths'] = self::INSTALLER_PATHS;
        }

        // composer/installers is itself a Composer plugin; Composer 2.2+ refuses to run any
        // plugin that isn't explicitly trusted when running non-interactively, which every
        // server-side sync does.
        if (($json['config']['allow-plugins'][self::INSTALLERS] ?? null) !== true) {
            $json['config']['allow-plugins'][self::INSTALLERS] = true;
        }

        return $json;
    }

    // `wpackagist-plugin/foo` -> wp-content/plugins/foo, `wpackagist-theme/bar` -> wp-content/themes/bar.
    public function managedPackageDir(string $vendorName): ?string
    {
        if (str_starts_with($vendorName, 'wpackagist-plugin/')) {
            return WP_CONTENT_DIR . '/plugins/' . substr($vendorName, strlen('wpackagist-plugin/'));
        }

        if (str_starts_with($vendorName, 'wpackagist-theme/')) {
            return WP_CONTENT_DIR . '/themes/' . substr($vendorName, strlen('wpackagist-theme/'));
        }

        return null;
    }

    public function managedDirExists(string $vendorName): bool
    {
        $dir = $this->managedPackageDir($vendorName);
        return $dir !== null && is_dir($dir);
    }

    public function removeManagedDir(string $vendorName): void
    {
        $dir = $this->managedPackageDir($vendorName);
        if ($dir !== null && is_dir($dir)) {
            $this->filesystem->remove($dir);
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

        $indexFile = $libDir . 'index.php';
        if (!file_exists($indexFile)) {
            file_put_contents($indexFile, "<?php\n// Silence is golden.\n"); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
        }
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

        $indexFile = $vendorDir . 'index.php';
        if (!file_exists($indexFile)) {
            file_put_contents($indexFile, "<?php\n// Silence is golden.\n"); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
        }

        $htaccess = $vendorDir . '.htaccess';
        if (!file_exists($htaccess)) {
            file_put_contents($htaccess, self::VENDOR_HTACCESS); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
        }
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
        $path = $this->loopressDir . 'composer.json';
        if (!file_exists($path)) {
            return null;
        }

        // Local file under our own working directory, not a remote URL: wp_remote_get() doesn't apply here.
        $contents = file_get_contents($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        return $contents !== false ? $contents : null;
    }

    public function readComposerLock(): ?string
    {
        $path = $this->loopressDir . 'composer.lock';
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
