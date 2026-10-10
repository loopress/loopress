<?php

declare(strict_types=1);

namespace Loopress\Update\Infrastructure;

use Loopress\Update\UsageStats;

/**
 * Anonymous "this site is active" ping, see obsidian/Product/Analytics.md. Triggered by
 * GithubReleaseChecker on a cache miss only, so at most twice a day per site, and only in
 * Loopress Full: src/Update/ is stripped from the Light build, which must never phone home.
 *
 * Fire-and-forget on purpose ('blocking' => false): the api being down or slow must never
 * delay the update check it piggybacks on, nor wp-admin.
 */
class UsagePing
{
    public const INSTALL_ID_OPTION = 'loopress_install_id';
    public const LAST_SENT_OPTION  = 'loopress_usage_ping_last_sent';
    private const MIN_INTERVAL     = 12 * HOUR_IN_SECONDS;
    private const ENDPOINT = 'https://api.loopress.dev/ping';

    public function send(): void
    {
        if (!UsageStats::isEnabled()) {
            return;
        }

        // Own guard, not the release transient's 12h TTL: transients can be evicted early (object
        // cache, DB cleanup), and the "at most twice a day" promise in the docs must still hold.
        // ponytail: two concurrent cache misses can both pass this read, harmless since the api
        // keeps one row per install and day; make it an atomic claim if that ever changes.
        $now = time();
        if ($now - (int) get_option(self::LAST_SENT_OPTION, 0) < self::MIN_INTERVAL) {
            return;
        }
        update_option(self::LAST_SENT_OPTION, $now, false);

        wp_remote_post(self::ENDPOINT, [
            'blocking'   => false,
            'timeout'    => 1,
            // WordPress's default User-Agent is "WordPress/<version>; <home_url>", which would leak
            // the site URL the payload deliberately leaves out.
            'user-agent' => 'Loopress/' . LOOPRESS_VERSION,
            'headers'    => ['Content-Type' => 'application/json'],
            'body'       => (string) wp_json_encode($this->payload()),
        ]);
    }

    /**
     * Never home_url(), the admin email, the site name or the plugin list: the install id is
     * random, not derived from the site, so a row in the api can't be traced back to a site.
     *
     * @return array<string, string>
     */
    public function payload(): array
    {
        return [
            'installId' => $this->installId(),
            'version'   => LOOPRESS_VERSION,
            'wp'        => get_bloginfo('version'),
            'php'       => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
            'locale'    => get_locale(),
            // The named zone if the admin picked a city, else the raw offset ("+02:00"), which is
            // WordPress's default ("UTC+0"). Country comes from this or the locale in the api,
            // deliberately not from the request IP (see Analytics.md).
            'timezone'  => wp_timezone_string(),
            'env'       => wp_get_environment_type(),
        ];
    }

    private function installId(): string
    {
        $id = get_option(self::INSTALL_ID_OPTION);
        if (is_string($id) && $id !== '') {
            return $id;
        }

        $id = wp_generate_uuid4();
        // Not autoloaded: only read here, twice a day at most.
        update_option(self::INSTALL_ID_OPTION, $id, false);

        return $id;
    }
}
