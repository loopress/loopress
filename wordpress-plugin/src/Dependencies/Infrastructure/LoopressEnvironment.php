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

    public function getLoopressDir(): string
    {
        return $this->loopressDir;
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

        if (!file_exists($this->loopressDir . 'composer.json')) {
            $this->writeComposerJson([
                'name'        => 'loopress/site-dependencies',
                'description' => 'Site-wide dependencies managed by Loopress Full',
                'version'     => '0.0.0',
                'autoload'    => ['psr-4' => ['LoopressLib\\' => 'lib/']],
                'config'      => [
                    'vendor-dir' => 'vendor',
                    'platform'   => ['php' => PHP_VERSION],
                ],
            ]);
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
