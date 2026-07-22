<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Service;

use Loopress\Dependencies\Infrastructure\ComposerRunner;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Dependencies\Infrastructure\PackagistClient;

class ComposerService
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
        $this->dxEnv->ensureInitialized();

        $json    = $this->dxEnv->readComposerJson();
        $require = $json['require'] ?? [];

        if (!is_array($require) || $require === []) {
            return [];
        }

        $locked    = $this->getLockedVersions();
        $installed = [];

        foreach ($require as $name => $constraint) {
            $name        = (string) $name;
            $installed[] = [
                'name'       => $name,
                'constraint' => $constraint,
                'version'    => $locked[$name] ?? $constraint,
            ];
        }

        return $installed;
    }

    /** @return array<string, string> package name to exact locked version */
    private function getLockedVersions(): array
    {
        $lock = $this->dxEnv->readComposerLock();
        if ($lock === null) {
            return [];
        }

        $data = json_decode($lock, true);
        if (!is_array($data)) {
            return [];
        }

        $versions = [];
        foreach (array_merge($data['packages'] ?? [], $data['packages-dev'] ?? []) as $package) {
            if (is_array($package) && isset($package['name'], $package['version'])) {
                $versions[(string) $package['name']] = (string) $package['version'];
            }
        }

        return $versions;
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
        $result = $this->composerRunner->run(['install']);

        if ($result['exit_code'] !== 0) {
            throw new \RuntimeException(esc_html($result['output']));
        }

        return $result['output'];
    }

    public function getDiagnostics(): array
    {
        $this->dxEnv->ensureInitialized();

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

    public function getOutdated(): array
    {
        $result = $this->composerRunner->run(['outdated'], ['--direct' => true, '--format' => 'json']);

        if ($result['exit_code'] !== 0) {
            throw new \RuntimeException(esc_html($result['output']));
        }

        // Strip any non-JSON preamble Composer may emit before the object.
        $raw   = $result['output'];
        $start = strpos($raw, '{');
        $json  = $start !== false ? substr($raw, $start) : '{}';
        $data  = json_decode($json, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('Failed to parse composer outdated output: ' . esc_html(json_last_error_msg()));
        }

        $installed = $data['installed'] ?? [];

        $outdated = array_filter(
            $installed,
            fn($package) => is_array($package) && ($package['version'] ?? null) !== ($package['latest'] ?? null)
        );

        return array_values(array_map(fn($package) => [
            'name'    => $package['name'],
            'version' => $package['version'],
            'latest'  => $package['latest'],
        ], $outdated));
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
            throw new \RuntimeException('Failed to parse composer audit output: ' . esc_html(json_last_error_msg()));
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

    public function getJson(): ?string
    {
        $this->dxEnv->ensureInitialized();
        return $this->dxEnv->readComposerJsonRaw();
    }

    public function getLock(): ?string
    {
        return $this->dxEnv->readComposerLock();
    }

    public function sync(string $composerJson, ?string $composerLock): string
    {
        $decoded = json_decode($composerJson, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \InvalidArgumentException('Invalid composer.json: ' . esc_html(json_last_error_msg()));
        }

        $previousJson = $this->dxEnv->readComposerJson();
        $previousLock = $this->dxEnv->readComposerLock();

        $this->dxEnv->writeComposerJson($decoded);

        if ($composerLock !== null) {
            $this->dxEnv->writeComposerLock($composerLock);
        }

        $result = $this->composerRunner->run($composerLock !== null ? ['install'] : ['update']);

        if ($result['exit_code'] !== 0) {
            // Restore the previous manifests so a failed sync doesn't leave the site
            // pointing at dependencies that were never actually installed.
            $this->dxEnv->writeComposerJson($previousJson);
            if ($previousLock !== null) {
                $this->dxEnv->writeComposerLock($previousLock);
            } elseif ($composerLock !== null) {
                $this->dxEnv->deleteComposerLock();
            }

            throw new \RuntimeException(esc_html($result['output']));
        }

        return $result['output'];
    }
}
