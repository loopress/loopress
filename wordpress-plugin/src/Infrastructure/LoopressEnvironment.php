<?php

namespace Loopress\Infrastructure;

use Symfony\Component\Filesystem\Exception\IOExceptionInterface;
use Symfony\Component\Filesystem\Filesystem;

class LoopressEnvironment
{
    private string $dxDir;
    private bool $initialized = false;
    private Filesystem $filesystem;

    public function __construct()
    {
        $this->dxDir      = WP_CONTENT_DIR . '/loopress/';
        $this->filesystem = new Filesystem();
    }

    public function getDxDir(): string
    {
        return $this->dxDir;
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

        if (!is_dir($this->dxDir)) {
            wp_mkdir_p($this->dxDir);
        }

        if (!file_exists($this->dxDir . 'composer.json')) {
            $this->writeComposerJson([
                'name'        => 'loopress/site-dependencies',
                'description' => 'Site-wide dependencies managed by Loopress',
                'version' => '0.0.0',
                'config'      => [
                    'vendor-dir' => 'vendor',
                    'platform'   => ['php' => PHP_VERSION],
                ],
            ]);
            return;
        }

        // Ensure config.platform.php matches the running PHP; prevents installing
        // packages whose requirements exceed the actual server version.
        $json = $this->readComposerJson();
        if (($json['config']['platform']['php'] ?? null) !== PHP_VERSION) {
            $json['config']['platform']['php'] = PHP_VERSION;
            $this->writeComposerJson($json);
        }
    }

    public function getAutoloadPath(): ?string
    {
        $path = $this->dxDir . 'vendor/autoload.php';
        return file_exists($path) ? $path : null;
    }

    /** @return array<string, mixed> */
    public function readComposerJson(): array
    {
        $path = $this->dxDir . 'composer.json';
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
            $this->filesystem->dumpFile($this->dxDir . 'composer.json', $encoded);
        } catch (IOExceptionInterface $e) {
            throw new \RuntimeException(esc_html("Failed to write composer.json to {$this->dxDir}: " . $e->getMessage()));
        }
    }

    public function readComposerLock(): ?string
    {
        $path = $this->dxDir . 'composer.lock';
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
            $this->filesystem->dumpFile($this->dxDir . 'composer.lock', $contents);
        } catch (IOExceptionInterface $e) {
            throw new \RuntimeException(esc_html("Failed to write composer.lock to {$this->dxDir}: " . $e->getMessage()));
        }
    }

    public function deleteComposerLock(): void
    {
        $path = $this->dxDir . 'composer.lock';
        if (file_exists($path)) {
            unlink($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
        }
    }
}
