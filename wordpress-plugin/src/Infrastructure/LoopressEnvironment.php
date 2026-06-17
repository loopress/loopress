<?php

namespace Loopress\Infrastructure;

class LoopressEnvironment
{
    private string $dxDir;

    public function __construct()
    {
        $this->dxDir = WP_CONTENT_DIR . '/loopress/';
    }

    public function getDxDir(): string
    {
        return $this->dxDir;
    }

    public function ensureInitialized(): void
    {
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
        $encoded = json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            throw new \RuntimeException('Failed to encode composer.json: ' . json_last_error_msg());
        }

        $result = file_put_contents($this->dxDir . 'composer.json', $encoded);
        if ($result === false) {
            throw new \RuntimeException("Failed to write composer.json to {$this->dxDir}");
        }
    }
}
