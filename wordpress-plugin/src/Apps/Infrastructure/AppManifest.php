<?php

declare(strict_types=1);

namespace Loopress\Apps\Infrastructure;

/**
 * Validates and normalises the manifest `lps app push` sends to POST /apps/<name>/commit.
 * Pure, no filesystem and no WordPress: AppsController does the disk checks (every declared
 * file actually present with a matching hash) after this has vetted the shape.
 *
 * Expected input:
 *   [
 *     'buildId'       => '9f2a1c7b4e10',
 *     'routing'       => 'hash',
 *     'mountSelector' => '#loopress-app-search',
 *     'crossOrigin'   => 'same-origin',   // optional, see AppsDirectory::writeCrossOriginPolicy()
 *     'entry'         => ['scripts' => ['assets/index-x.js'], 'styles' => ['assets/index-y.css']],
 *     'files'         => [['path' => 'assets/index-x.js', 'sha256' => '<64hex>', 'size' => 1234], ...],
 *   ]
 */
final class AppManifest
{
    private const BUILD_ID_PATTERN      = '/^[a-f0-9]{8,64}$/';
    private const MOUNT_SELECTOR_PATTERN = '/^#[A-Za-z][\w-]*$/';
    private const SHA256_PATTERN        = '/^[a-f0-9]{64}$/';

    // hash routing keeps the SPA inside one WordPress page with no server rewrite. history
    // routing needs a rewrite rule that would collide with permalinks and other plugins, so
    // it is refused for now rather than half-supported.
    private const SUPPORTED_ROUTING = ['hash'];

    // Cross-Origin-Resource-Policy values an app can opt into. `cross-origin` is the browser
    // default, so it is simply the absence of the setting.
    public const SUPPORTED_CROSS_ORIGIN = ['same-origin', 'same-site'];

    /**
     * @param array<mixed> $raw a decoded request body, validated field by field below
     * @return array{buildId: string, routing: string, mountSelector: string, crossOrigin: string|null, entry: array{scripts: string[], styles: string[]}, files: array<int, array{path: string, sha256: string, size: int}>}
     * @throws \InvalidArgumentException on any malformed field
     */
    public static function normalize(array $raw): array
    {
        $buildId = $raw['buildId'] ?? null;
        $buildId = is_string($buildId) ? $buildId : '';
        if (preg_match(self::BUILD_ID_PATTERN, $buildId) !== 1) {
            throw new \InvalidArgumentException('buildId must be a lowercase hex string');
        }

        $routing = $raw['routing'] ?? null;
        $routing = is_string($routing) ? $routing : 'hash';
        if (!in_array($routing, self::SUPPORTED_ROUTING, true)) {
            throw new \InvalidArgumentException(
                "routing \"{$routing}\" is not supported; only \"hash\" routing works without a server rewrite"
            );
        }

        $mountSelector = $raw['mountSelector'] ?? null;
        $mountSelector = is_string($mountSelector) ? $mountSelector : '';
        if (preg_match(self::MOUNT_SELECTOR_PATTERN, $mountSelector) !== 1) {
            throw new \InvalidArgumentException('mountSelector must be a CSS id selector like "#loopress-app-search"');
        }

        $crossOrigin = $raw['crossOrigin'] ?? null;
        if ($crossOrigin !== null && !in_array($crossOrigin, self::SUPPORTED_CROSS_ORIGIN, true)) {
            throw new \InvalidArgumentException(
                'crossOrigin must be one of: ' . implode(', ', self::SUPPORTED_CROSS_ORIGIN)
            );
        }

        $files    = self::normalizeFiles($raw['files'] ?? null);
        $filePaths = array_column($files, 'path');

        $entry = self::normalizeEntry($raw['entry'] ?? null, $filePaths);

        return [
            'buildId'       => $buildId,
            'routing'       => $routing,
            'mountSelector' => $mountSelector,
            'crossOrigin'   => $crossOrigin,
            'entry'         => $entry,
            'files'         => $files,
        ];
    }

    /**
     * @return array<int, array{path: string, sha256: string, size: int}>
     */
    private static function normalizeFiles(mixed $raw): array
    {
        if (!is_array($raw) || $raw === []) {
            throw new \InvalidArgumentException('files must be a non-empty array');
        }

        $files = [];
        $seen  = [];
        foreach ($raw as $entry) {
            $file                = self::normalizeFile($entry, $seen);
            $seen[$file['path']] = true;
            $files[]             = $file;
        }

        return $files;
    }

    /**
     * @param array<string, true> $seen paths already listed, for the duplicate check
     * @return array{path: string, sha256: string, size: int}
     */
    private static function normalizeFile(mixed $entry, array $seen): array
    {
        if (!is_array($entry)) {
            throw new \InvalidArgumentException('each file must be an object');
        }
        $path = $entry['path'] ?? null;
        $path = is_string($path) ? $path : '';
        if (!AppsDirectory::isValidAssetPath($path)) {
            throw new \InvalidArgumentException("unsafe or unsupported asset path: \"{$path}\"");
        }
        if (isset($seen[$path])) {
            throw new \InvalidArgumentException("duplicate file path: \"{$path}\"");
        }

        $sha256 = $entry['sha256'] ?? null;
        $sha256 = is_string($sha256) ? strtolower($sha256) : '';
        if (preg_match(self::SHA256_PATTERN, $sha256) !== 1) {
            throw new \InvalidArgumentException("file \"{$path}\" has no valid sha256");
        }

        $size = $entry['size'] ?? null;
        if (!is_int($size) || $size < 0) {
            throw new \InvalidArgumentException("file \"{$path}\" has no valid size");
        }

        return ['path' => $path, 'sha256' => $sha256, 'size' => $size];
    }

    /**
     * @param string[] $filePaths
     * @return array{scripts: string[], styles: string[]}
     */
    private static function normalizeEntry(mixed $raw, array $filePaths): array
    {
        $raw     = is_array($raw) ? $raw : [];
        $scripts = self::stringList($raw['scripts'] ?? []);
        $styles  = self::stringList($raw['styles'] ?? []);

        if ($scripts === []) {
            throw new \InvalidArgumentException('entry.scripts must list at least one script');
        }

        foreach ([...$scripts, ...$styles] as $ref) {
            if (!in_array($ref, $filePaths, true)) {
                throw new \InvalidArgumentException("entry references \"{$ref}\", which is not in files");
            }
        }

        return ['scripts' => $scripts, 'styles' => $styles];
    }

    /**
     * @return string[]
     */
    private static function stringList(mixed $raw): array
    {
        if (!is_array($raw)) {
            return [];
        }

        return array_values(array_filter($raw, 'is_string'));
    }
}
