<?php

namespace Loopress\Infrastructure;

class LoopressEnvironment
{
    private string $dxDir;
    private bool $initialized = false;

    public function __construct()
    {
        $this->dxDir = WP_CONTENT_DIR . '/loopress/';
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

        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new \RuntimeException("Failed to read composer.json from {$path}");
        }

        $data = json_decode($contents, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('composer.json contains invalid JSON: ' . json_last_error_msg());
        }

        return $data ?? [];
    }

    /** @param array<string, mixed> $json */
    public function writeComposerJson(array $json): void
    {
        $this->ensureInitialized();

        $encoded = json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            throw new \RuntimeException('Failed to encode composer.json: ' . json_last_error_msg());
        }

        $result = file_put_contents($this->dxDir . 'composer.json', $encoded);
        if ($result === false) {
            throw new \RuntimeException("Failed to write composer.json to {$this->dxDir}");
        }
    }

    public function readComposerLock(): ?string
    {
        $path = $this->dxDir . 'composer.lock';
        if (!file_exists($path)) {
            return null;
        }

        $contents = file_get_contents($path);
        return $contents !== false ? $contents : null;
    }

    public function writeComposerLock(string $contents): void
    {
        $this->ensureInitialized();

        $result = file_put_contents($this->dxDir . 'composer.lock', $contents);
        if ($result === false) {
            throw new \RuntimeException("Failed to write composer.lock to {$this->dxDir}");
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
