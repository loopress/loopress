<?php

declare(strict_types=1);

namespace Loopress\Update\Infrastructure;

use Nyholm\Psr7\Request;
use Psr\Http\Client\ClientExceptionInterface;
use Psr\Http\Client\ClientInterface;

class GithubReleaseChecker
{
    private const CACHE_TTL = 12 * HOUR_IN_SECONDS;
    private const CACHE_KEY = 'loopress_full_latest_release';
    private const RELEASES_URL = 'https://api.github.com/repos/loopress/loopress/releases?per_page=10';
    // The repo also publishes @loopress/cli releases; only the wordpress-plugin@ tag is ours.
    private const TAG_PREFIX = 'wordpress-plugin@';
    // Matches the asset name .github/workflows/release.yml attaches to every
    // wordpress-plugin@ release (see the "Build and zip both plugin editions" step).
    private const ZIP_ASSET_NAME = 'loopress-full.zip';

    /** @var array{version: string, zip_url: ?string}|null */
    private ?array $releaseCache = null;
    private bool $releaseCacheLoaded = false;

    public function __construct(private ClientInterface $httpClient)
    {
    }

    /**
     * Latest published Loopress Full version, or null if it could not be determined
     * (network failure, unexpected response, or no matching release in the fetched
     * window). Never throws: this runs on every cached admin page load, a GitHub hiccup
     * must not break wp-admin, it should just skip the notice for this cycle.
     */
    public function getLatestVersion(): ?string
    {
        return $this->getLatestRelease()['version'] ?? null;
    }

    /**
     * Direct download URL of the loopress-full.zip asset attached to the latest matching
     * release, or null if no newer release (or no matching zip asset on it) could be found.
     * Handed straight to WordPress as the update package, see PluginUpdater.
     */
    public function getLatestDownloadUrl(): ?string
    {
        return $this->getLatestRelease()['zip_url'] ?? null;
    }

    /**
     * Memoized per instance, not just per transient: PluginUpdater calls both
     * getLatestVersion() and getLatestDownloadUrl() on the same request, and without this
     * a transient cache miss would hit GitHub (and re-run set_transient) twice.
     *
     * @return array{version: string, zip_url: ?string}|null
     */
    private function getLatestRelease(): ?array
    {
        if ($this->releaseCacheLoaded) {
            return $this->releaseCache;
        }

        $cached = get_transient(self::CACHE_KEY);
        if ($cached !== false) {
            $release = $cached === '' ? null : $cached;
        } else {
            $release = $this->fetchLatestRelease();
            // Empty string, not false, caches a "checked, nothing found" result: get_transient()
            // itself returns false on a cache miss, so caching false here would be
            // indistinguishable from never having checked, and every admin page load would hit
            // GitHub again.
            set_transient(self::CACHE_KEY, $release ?? '', self::CACHE_TTL);
        }

        $this->releaseCache       = $release;
        $this->releaseCacheLoaded = true;

        return $release;
    }

    /** @return array{version: string, zip_url: ?string}|null */
    private function fetchLatestRelease(): ?array
    {
        try {
            $response = $this->httpClient->sendRequest(new Request('GET', self::RELEASES_URL));
        } catch (ClientExceptionInterface) {
            return null;
        }

        $releases = json_decode((string) $response->getBody(), true);
        if (!is_array($releases)) {
            return null;
        }

        foreach ($releases as $release) {
            $tag = is_array($release) ? ($release['tag_name'] ?? null) : null;
            if (is_string($tag) && str_starts_with($tag, self::TAG_PREFIX)) {
                return [
                    'version' => substr($tag, strlen(self::TAG_PREFIX)),
                    'zip_url' => $this->findZipAssetUrl($release),
                ];
            }
        }

        return null;
    }

    /** @param array<string, mixed> $release */
    private function findZipAssetUrl(array $release): ?string
    {
        $assets = $release['assets'] ?? null;
        if (!is_array($assets)) {
            return null;
        }

        foreach ($assets as $asset) {
            if (!is_array($asset) || ($asset['name'] ?? null) !== self::ZIP_ASSET_NAME) {
                continue;
            }

            $url = $asset['browser_download_url'] ?? null;

            return is_string($url) ? $url : null;
        }

        return null;
    }
}
