<?php

declare(strict_types=1);

namespace Loopress\Update;

/**
 * Opt-in state of the anonymous usage ping (Settings tab), shared between UsagePing and
 * UsageStatsController. Same as Sentry's Consent: nothing is sent until an admin has said yes.
 * The ping only carries technical data (versions, locale, timezone), never content, URLs or
 * error messages.
 */
final class UsageStats
{
    public const OPTION = 'loopress_usage_stats_enabled';

    /** Absent (never decided, or right after a reset) counts as disabled. */
    public static function isEnabled(): bool
    {
        return (bool) get_option(self::OPTION, false);
    }
}
