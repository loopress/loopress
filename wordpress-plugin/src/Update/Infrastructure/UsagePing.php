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
    private const ENDPOINT = 'https://api.loopress.dev/ping';

    public function send(): void
    {
        if (!UsageStats::isEnabled()) {
            return;
        }

        wp_remote_post(self::ENDPOINT, [
            'blocking' => false,
            'timeout'  => 1,
            'headers'  => ['Content-Type' => 'application/json'],
            'body'     => (string) wp_json_encode($this->payload()),
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
            // Empty when the admin picked a raw UTC offset: the country is derived from this
            // named zone in the api, deliberately not from the request IP (see Analytics.md).
            'timezone'  => (string) get_option('timezone_string', ''),
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
