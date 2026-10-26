<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Infrastructure;

use Composer\Semver\Semver;
use Nyholm\Psr7\Request;
use Psr\Http\Client\ClientExceptionInterface;
use Psr\Http\Client\ClientInterface;

class PackagistClient
{
    private const CACHE_TTL = 5 * MINUTE_IN_SECONDS;

    public function __construct(private readonly ClientInterface $httpClient)
    {
    }

    /**
     * Returns sorted stable versions with PHP compatibility info, null if the package does not exist.
     * Each entry: ['version' => string, 'php_compatible' => bool, 'php_constraint' => string]
     * Throws \RuntimeException on network failure.
     *
     * @return array<int, array<string, mixed>>|null
     */
    public function getVersions(string $package): ?array
    {
        // Wrapped in an array so a cached null ("package not found") is
        // distinguishable from a cache miss (get_transient returns false).
        $cacheKey = 'loopress_pkg_versions_' . hash('sha256', $package);
        $cached   = get_transient($cacheKey);
        if (is_array($cached) && array_key_exists('versions', $cached)) {
            $versions = $cached['versions'];

            return is_array($versions)
                ? array_values(array_map(static fn(array $v): array => array_filter($v, 'is_string', ARRAY_FILTER_USE_KEY), array_filter($versions, 'is_array')))
                : null;
        }

        $versions = $this->fetchVersions($package);
        set_transient($cacheKey, ['versions' => $versions], self::CACHE_TTL);

        return $versions;
    }

    /** @return array<int, array<string, mixed>>|null */
    private function fetchVersions(string $package): ?array
    {
        try {
            $response = $this->httpClient->sendRequest(new Request('GET', "https://packagist.org/packages/{$package}.json"));
        } catch (ClientExceptionInterface $e) {
            throw new \RuntimeException(esc_html($e->getMessage()));
        }

        $body = json_decode((string) $response->getBody(), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('Invalid response from Packagist: ' . esc_html(json_last_error_msg()));
        }

        $rawVersions = $body['package']['versions'] ?? null;
        if (!is_array($rawVersions) || $rawVersions === []) {
            return null;
        }

        $stable = array_filter(
            $rawVersions,
            // A purely numeric version key ("2") comes back from json_decode() as an int.
            fn($_, int|string $v): bool => !str_starts_with((string) $v, 'dev-') && !str_ends_with((string) $v, '-dev'),
            ARRAY_FILTER_USE_BOTH
        );

        uasort($stable, fn($a, $b): int => version_compare(
            $b['version_normalized'] ?? $b['version'],
            $a['version_normalized'] ?? $a['version'],
        ));

        // array_keys() hands a purely numeric version ("2") back as an int.
        return array_map(function (int|string $version, array $data): array {
            $require       = $data['require'] ?? null;
            $phpConstraint = is_array($require) ? ($require['php'] ?? null) : null;
            $phpConstraint = is_string($phpConstraint) ? $phpConstraint : null;
            $phpCompatible = $phpConstraint !== null ? $this->isPhpCompatible($phpConstraint) : null;

            return [
                'version'        => (string) $version,
                'php_compatible' => $phpCompatible,
                'php_constraint' => $phpConstraint,
            ];
        }, array_keys($stable), $stable);
    }

    private function isPhpCompatible(string $constraint): bool
    {
        try {
            return Semver::satisfies(PHP_VERSION, $constraint);
        } catch (\UnexpectedValueException) {
            return true;
        }
    }
}
