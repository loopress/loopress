<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Infrastructure;

use Composer\Semver\Semver;

class PackagistClient
{
    private const CACHE_TTL = 5 * MINUTE_IN_SECONDS;

    /**
     * Returns sorted stable versions with PHP compatibility info, null if the package does not exist.
     * Each entry: ['version' => string, 'php_compatible' => bool, 'php_constraint' => string]
     * Throws \RuntimeException on network failure.
     */
    public function getVersions(string $package): ?array
    {
        // Wrapped in an array so a cached null ("package not found") is
        // distinguishable from a cache miss (get_transient returns false).
        $cacheKey = 'loopress_pkg_versions_' . hash('sha256', $package);
        $cached   = get_transient($cacheKey);
        if (is_array($cached) && array_key_exists('versions', $cached)) {
            return $cached['versions'];
        }

        $versions = $this->fetchVersions($package);
        set_transient($cacheKey, ['versions' => $versions], self::CACHE_TTL);

        return $versions;
    }

    /** @return array<int, array<string, mixed>>|null */
    private function fetchVersions(string $package): ?array
    {
        $response = wp_remote_get(
            "https://packagist.org/packages/{$package}.json",
            ['timeout' => 10]
        );

        if (is_wp_error($response)) {
            throw new \RuntimeException(esc_html($response->get_error_message()));
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('Invalid response from Packagist: ' . esc_html(json_last_error_msg()));
        }

        if (empty($body['package']['versions'])) {
            return null;
        }

        $rawVersions = $body['package']['versions'];

        $stable = array_filter(
            $rawVersions,
            fn($_, $v) => !str_starts_with($v, 'dev-') && !str_ends_with($v, '-dev'),
            ARRAY_FILTER_USE_BOTH
        );

        uasort($stable, fn($a, $b) => version_compare(
            $b['version_normalized'] ?? $b['version'],
            $a['version_normalized'] ?? $a['version'],
        ));

        return array_map(function (string $version, array $data) {
            $phpConstraint = $data['require']['php'] ?? null;
            $phpCompatible = $phpConstraint !== null ? $this->isPhpCompatible($phpConstraint) : null;

            return [
                'version'        => $version,
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
