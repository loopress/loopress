<?php

namespace Loopress\Service;

use Loopress\Infrastructure\ComposerRunner;
use Loopress\Infrastructure\LoopressEnvironment;
use Loopress\Infrastructure\PackagistClient;

class VendorService
{
    public function __construct(
        private LoopressEnvironment $dxEnv,
        private ComposerRunner $composerRunner,
        private PackagistClient $packagistClient,
    ) {}

    public function getVersions(string $package): ?array
    {
        return $this->packagistClient->getVersions($package);
    }

    public function getInstalled(): array
    {
        $json = $this->dxEnv->readComposerJson();

        if (empty($json['require'])) {
            return [];
        }

        return array_map(
            fn($name, $constraint) => ['name' => $name, 'version' => $constraint],
            array_keys($json['require']),
            $json['require']
        );
    }

    public function requirePackage(string $package, string $version): string
    {
        $result = $this->composerRunner->run(['require', "{$package}:{$version}"]);

        if ($result['exit_code'] !== 0) {
            throw new \RuntimeException(esc_html($result['output']));
        }

        return $result['output'];
    }

    public function removePackage(string $package): string
    {
        $result = $this->composerRunner->run(['remove', $package]);

        if ($result['exit_code'] !== 0) {
            throw new \RuntimeException(esc_html($result['output']));
        }

        return $result['output'];
    }

    public function repair(): string
    {
        $result = $this->composerRunner->run(['update']);

        if ($result['exit_code'] !== 0) {
            throw new \RuntimeException(esc_html($result['output']));
        }

        return $result['output'];
    }

    public function getDiagnostics(): array
    {
        $phpVersion  = PHP_VERSION;
        $json        = $this->dxEnv->readComposerJson();
        $platformPhp = $json['config']['platform']['php'] ?? null;
        $issues      = [];

        if ($platformPhp === null) {
            $issues[] = [
                'code'    => 'platform_php_missing',
                'message' => "config.platform.php is not set. Composer will not enforce PHP version constraints, which can lead to installing packages incompatible with PHP {$phpVersion}.",
            ];
        } elseif ($platformPhp !== $phpVersion) {
            $issues[] = [
                'code'    => 'platform_php_mismatch',
                'message' => "config.platform.php is {$platformPhp} but the server is running PHP {$phpVersion}. Packages may be installed for the wrong PHP version.",
            ];
        }

        return [
            'php_version'  => $phpVersion,
            'platform_php' => $platformPhp,
            'issues'       => $issues,
        ];
    }

    public function audit(): array
    {
        $result = $this->composerRunner->run(['audit'], ['--format' => 'json']);

        // Exit code 1 means advisories found; not an error, just a non-empty report.
        if ($result['exit_code'] > 1) {
            throw new \RuntimeException(esc_html($result['output']));
        }

        // Strip any non-JSON preamble Composer may emit before the object.
        $raw   = $result['output'];
        $start = strpos($raw, '{');
        $json  = $start !== false ? substr($raw, $start) : '{}';
        $data  = json_decode($json, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('Failed to parse composer audit output: ' . json_last_error_msg());
        }

        $data = $data ?? [];

        return [
            'advisories' => $data['advisories'] ?? [],
            'abandoned'  => $data['abandoned'] ?? [],
        ];
    }

    public function fixPlatform(): void
    {
        $json = $this->dxEnv->readComposerJson();
        $json['config']['platform']['php'] = PHP_VERSION;
        $this->dxEnv->writeComposerJson($json);
    }


}
