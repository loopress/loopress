<?php

declare(strict_types=1);

namespace Loopress\Sentry;

/**
 * Single source of truth for the option name and default (opt-in: consent must be given
 * explicitly, so existing installs upgrading into this feature keep reporting nothing
 * until an admin visits the Settings tab), shared between SentryModule's boot-time gate
 * and SentryConsentController's REST reads/writes.
 */
final class Consent
{
    public const OPTION = 'loopress_sentry_enabled';

    /**
     * Three states, not two: null means the admin has never been asked (option row absent,
     * including right after a reset), distinct from an explicit "no" (option present, false).
     * get_option's own $default only kicks in when the row doesn't exist at all, so null
     * survives here exactly when nobody has decided yet.
     */
    public static function status(): ?bool
    {
        $value = get_option(self::OPTION, null);

        return $value === null ? null : (bool) $value;
    }

    public static function isEnabled(): bool
    {
        return self::status() === true;
    }
}
