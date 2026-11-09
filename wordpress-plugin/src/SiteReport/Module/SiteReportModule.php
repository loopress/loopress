<?php

declare(strict_types=1);

namespace Loopress\SiteReport\Module;

use Loopress\Contract\Module;
use Loopress\SiteReport\Infrastructure\ReportSender;
use Loopress\SiteReport\RestApi\SiteTokenController;
use Loopress\SiteReport\SiteToken;

/**
 * Registers the settings route and the twice-daily report. The event is scheduled when a token
 * is saved and cleared on disconnect, so boot never reads the (not autoloaded) token option.
 */
final class SiteReportModule implements Module
{
    public const CRON_HOOK = 'loopress_site_report';

    public function boot(): void
    {
        add_action('rest_api_init', fn() => (new SiteTokenController())->register_routes());
        add_action(self::CRON_HOOK, [self::class, 'report']);
    }

    public static function report(): void
    {
        $token = SiteToken::get();
        // Cleared some other way (settings reset, option deleted): stop reporting.
        if ($token === '') {
            self::unschedule();

            return;
        }

        (new ReportSender())->sendInBackground($token);
    }

    /** False when WordPress could not store the event: no report would ever follow. */
    public static function schedule(): bool
    {
        if (wp_next_scheduled(self::CRON_HOOK) !== false) {
            return true;
        }

        return wp_schedule_event(time() + 12 * HOUR_IN_SECONDS, 'twicedaily', self::CRON_HOOK) === true;
    }

    public static function unschedule(): void
    {
        wp_clear_scheduled_hook(self::CRON_HOOK);
    }
}
