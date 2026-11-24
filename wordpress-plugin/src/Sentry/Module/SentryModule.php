<?php

declare(strict_types=1);

namespace Loopress\Sentry\Module;

use Loopress\Contract\Module;
use Loopress\Sentry\Consent;
use Loopress\Sentry\RestApi\SentryConsentController;
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
 *
 * Gated on Consent::isEnabled() (opt-in, see Consent): the SDK's global handlers must not
 * install at all unless the admin has switched it on in the Settings tab, not just have
 * before_send drop events afterward, otherwise the SDK would still be reaching out to Sentry
 * before any consent was given.
 */
final class SentryModule implements Module
{
    private const DSN = 'https://3e9a6e7e6b46c9989465833cf2605581@o4511586904309760.ingest.de.sentry.io/4511791253487696';

    public function boot(): void
    {
        add_action('rest_api_init', fn() => (new SentryConsentController())->register_routes());

        if (!Consent::isEnabled()) {
            return;
        }

        \Sentry\init([
            'dsn'         => self::DSN,
            'environment' => (defined('WP_DEBUG') && WP_DEBUG) ? 'development' : 'production',
            'release'     => LOOPRESS_VERSION,
            'send_default_pii'      => false,
            'max_request_body_size' => 'never',
            'before_send' => static fn(Event $event): ?Event => self::isOwnEvent($event) ? self::scrub($event) : null,
        ]);
    }

    /**
     * Keeps only what the consent card lists: the error, its stack trace, the plugin version, the
     * environment and the request's method and URL. Drops the server name, the user, the OS and
     * runtime contexts (the OS kernel string carries the hostname), the Composer module list, and every
     * request field but the method and the URL without its query string (headers, cookies, body,
     * query string, env).
     */
    public static function scrub(Event $event): Event
    {
        $event->setServerName(null);
        $event->setUser(null);
        $event->setOsContext(null);
        $event->setRuntimeContext(null);
        $event->setModules([]);

        $request  = $event->getRequest();
        $filtered = [];
        if (isset($request['method']) && is_string($request['method'])) {
            $filtered['method'] = $request['method'];
        }
        if (isset($request['url']) && is_string($request['url'])) {
            $filtered['url'] = explode('#', explode('?', $request['url'], 2)[0], 2)[0];
        }
        $event->setRequest($filtered);

        return $event;
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
