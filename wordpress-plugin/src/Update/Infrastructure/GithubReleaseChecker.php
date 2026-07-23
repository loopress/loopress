<?php

declare(strict_types=1);

namespace Loopress\Update\Infrastructure;

use Nyholm\Psr7\Request;
use Psr\Http\Client\ClientExceptionInterface;
use Psr\Http\Client\ClientInterface;

class GithubReleaseChecker
{
    private const CACHE_TTL = 12 * HOUR_IN_SECONDS;
    private const CACHE_KEY = 'loopress_full_latest_version';
    private const RELEASES_URL = 'https://api.github.com/repos/loopress/loopress/releases?per_page=10';
    // The repo also publishes @loopress/cli releases; only the wordpress-plugin@ tag is ours.
    private const TAG_PREFIX = 'wordpress-plugin@';

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
        $cached = get_transient(self::CACHE_KEY);
        if ($cached !== false) {
            return $cached === '' ? null : $cached;
        }

        $version = $this->fetchLatestVersion();
        // Empty string, not false, caches a "checked, nothing found" result: get_transient()
        // itself returns false on a cache miss, so caching false here would be indistinguishable
        // from never having checked, and every admin page load would hit GitHub again.
        set_transient(self::CACHE_KEY, $version ?? '', self::CACHE_TTL);

        return $version;
    }

    private function fetchLatestVersion(): ?string
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
                return substr($tag, strlen(self::TAG_PREFIX));
            }
        }

        return null;
    }
}
