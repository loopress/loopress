<?php

declare(strict_types=1);

namespace Loopress\SiteReport;

/**
 * The site token pasted from the console, and the home_url() it was connected from. Neither
 * option is autoloaded: they are only read by the settings route and the twice-daily cron.
 */
final class SiteToken
{
    public const OPTION     = 'loopress_site_token';
    public const URL_OPTION = 'loopress_site_token_url';
    public const PREFIX     = 'lps_site_';

    public static function get(): string
    {
        $token = get_option(self::OPTION, '');

        return is_string($token) ? $token : '';
    }

    public static function isValidFormat(string $token): bool
    {
        return preg_match('/^lps_site_[0-9a-f]{16,128}$/', $token) === 1;
    }

    public static function save(string $token): void
    {
        update_option(self::OPTION, $token, false);
        update_option(self::URL_OPTION, home_url(), false);
    }

    public static function clear(): void
    {
        delete_option(self::OPTION);
        delete_option(self::URL_OPTION);
    }

    /** Never the token in clear: only its prefix and last 4 characters. */
    public static function masked(string $token): ?string
    {
        return $token === '' ? null : self::PREFIX . '…' . substr($token, -4);
    }
}
