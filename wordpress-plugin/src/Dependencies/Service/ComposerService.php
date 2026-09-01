<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Service;

use Loopress\Dependencies\Infrastructure\ComposerRunner;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Dependencies\Infrastructure\PackagistClient;
use Nyholm\Psr7\Request;
use Psr\Http\Client\ClientExceptionInterface;
use Psr\Http\Client\ClientInterface;

class ComposerService
{
    private const VENDOR_EXPOSURE_CACHE_KEY = 'loopress_vendor_publicly_accessible';

    public function __construct(
        private LoopressEnvironment $environment,
        private ComposerRunner $composerRunner,
        private PackagistClient $packagistClient,
        private ClientInterface $httpClient,
    ) {}

    public function getVersions(string $package): ?array
    {
        return $this->packagistClient->getVersions($package);
    }

    // LoopressEnvironment can't run Composer itself (it has no ComposerRunner: that would be
    // a constructor cycle, ComposerRunner already depends on LoopressEnvironment), so it only
    // flags when composer.json was migrated to add the lib/ autoload entry. This service has
    // both dependencies already, so it's where the flag actually gets acted on.
    //
    // Best-effort: getInstalled()/getDiagnostics()/getJson() (this method's only callers)
    // don't wrap this call in a try/catch the way requirePackage()/repair()/etc. do, a
    // dump-autoload failure here (e.g. another Composer operation holding the lock) would
    // otherwise turn a plain read into an uncaught exception. composer.json is already
    // patched by this point regardless, so retryLibAutoloadDump() re-flags the pending
    // migration on failure rather than letting needsLibAutoloadDump()'s own take-semantics
    // silently discard it, still self-heals anyway the next time any real Composer operation
    // runs (require/update/repair all regenerate the autoloader from the composer.json
    // already on disk, lib/ entry included), just not before then.
    private function ensureInitialized(): void
    {
        $this->environment->ensureInitialized();

        if ($this->environment->needsLibAutoloadDump()) {
            try {
                $this->composerRunner->run(['dump-autoload']);
            } catch (\Throwable $e) {
                $this->environment->retryLibAutoloadDump();
                error_log('Loopress composer: failed to dump the autoloader after adding lib/: ' . $e->getMessage()); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
            }
        }
    }

    public function getInstalled(): array
    {
        $this->ensureInitialized();

        $json    = $this->environment->readComposerJson();
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
        $lock = $this->environment->readComposerLock();
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
        $this->ensureInitialized();

        $phpVersion  = PHP_VERSION;
        $json        = $this->environment->readComposerJson();
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

        if ($this->isVendorPubliclyAccessible()) {
            $issues[] = [
                'code'    => 'vendor_publicly_accessible',
                'message' => 'vendor/ is reachable over HTTP: dependency names and versions are exposed, and any bundled PHP file can be requested directly. The .htaccess written alongside it is not being enforced by this webserver (likely nginx, or AllowOverride disabled); add an equivalent server-level rule denying access to wp-content/loopress/vendor/.',
            ];
        }

        return [
            'php_version'  => $phpVersion,
            'platform_php' => $platformPhp,
            'issues'       => $issues,
        ];
    }

    // LoopressEnvironment::ensureVendorDir() writes a .htaccess denying access to vendor/, but
    // .htaccess only works where the webserver actually reads it (Apache/LiteSpeed with
    // AllowOverride enabled); nginx ignores it outright. Verify from the outside, over a real
    // HTTP request, instead of assuming the file on disk is being honoured. Cached: this is a
    // network round-trip on every diagnostics load otherwise.
    private function isVendorPubliclyAccessible(): bool
    {
        $cached = get_transient(self::VENDOR_EXPOSURE_CACHE_KEY);
        if (is_array($cached) && array_key_exists('exposed', $cached)) {
            return $cached['exposed'];
        }

        $exposed = false;
        try {
            $url      = content_url('loopress/vendor/composer/installed.json');
            $response = $this->httpClient->sendRequest(new Request('GET', $url));
            $exposed  = $response->getStatusCode() === 200;
        } catch (ClientExceptionInterface) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
            // Network failure: don't report a false positive, just retry at the next cache expiry.
        }

        set_transient(self::VENDOR_EXPOSURE_CACHE_KEY, ['exposed' => $exposed], DAY_IN_SECONDS);

        return $exposed;
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
        $json = $this->environment->readComposerJson();
        $json['config']['platform']['php'] = PHP_VERSION;
        $this->environment->writeComposerJson($json);
    }

    public function getJson(): ?string
    {
        $this->ensureInitialized();
        return $this->environment->readComposerJsonRaw();
    }

    public function getLock(): ?string
    {
        return $this->environment->readComposerLock();
    }

    public function sync(string $composerJson, ?string $composerLock): string
    {
        $decoded = json_decode($composerJson, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \InvalidArgumentException('Invalid composer.json: ' . esc_html(json_last_error_msg()));
        }

        $previousJson = $this->environment->readComposerJson();
        $previousLock = $this->environment->readComposerLock();

        $this->environment->writeComposerJson($decoded);

        if ($composerLock !== null) {
            $this->environment->writeComposerLock($composerLock);
        }

        $result = $this->composerRunner->run($composerLock !== null ? ['install'] : ['update']);

        if ($result['exit_code'] !== 0) {
            // Restore the previous manifests so a failed sync doesn't leave the site
            // pointing at dependencies that were never actually installed.
            $this->environment->writeComposerJson($previousJson);
            if ($previousLock !== null) {
                $this->environment->writeComposerLock($previousLock);
            } elseif ($composerLock !== null) {
                $this->environment->deleteComposerLock();
            }

            throw new \RuntimeException(esc_html($result['output']));
        }

        return $result['output'];
    }
}
