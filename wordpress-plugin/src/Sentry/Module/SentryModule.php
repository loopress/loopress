<?php

declare(strict_types=1);

namespace Loopress\Sentry\Module;

use Loopress\Contract\Module;
use Sentry\Event;

/**
 * Initializes the Sentry PHP SDK on boot (plugins_loaded priority 1), so its default
 * error/exception/fatal handlers are installed for the rest of the request. An empty DSN is
 * a documented no-op for the SDK (Options::normalizeDsnOption treats '' the same as null), so
 * this is safe to ship before a real DSN is filled in below. Filtered via before_send rather
 * than scoped some other way: Sentry's global handlers are the only thing that also catches
 * fatals, and this plugin doesn't control every code path that can throw during a request, so
 * wrapping call sites one by one would miss some. before_send drops any event whose exception
 * didn't pass through this plugin's own files, so a site's Sentry project never fills up with
 * errors from its theme or other plugins just because Loopress happened to be active too.
 */
class SentryModule implements Module
{
    private const DSN = 'https://3e9a6e7e6b46c9989465833cf2605581@o4511586904309760.ingest.de.sentry.io/4511791253487696';

    public function boot(): void
    {
        \Sentry\init([
            'dsn'         => self::DSN,
            'environment' => (defined('WP_DEBUG') && WP_DEBUG) ? 'development' : 'production',
            'release'     => LOOPRESS_VERSION,
            'before_send' => static fn(Event $event): ?Event => self::isOwnEvent($event) ? $event : null,
        ]);
    }

    /** Kept public and side-effect free so it's testable without booting the SDK itself. */
    public static function isOwnEvent(Event $event): bool
    {
        foreach ($event->getExceptions() as $exception) {
            foreach ($exception->getStacktrace()?->getFrames() ?? [] as $frame) {
                if (str_starts_with($frame->getFile(), LOOPRESS_PLUGIN_PATH)) {
                    return true;
                }
            }
        }

        return false;
    }
}
