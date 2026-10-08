<?php

declare(strict_types=1);

namespace Loopress\Update\RestApi;

use Loopress\RestApi\RequiresManageOptionsCapability;
use Loopress\Update\UsageStats;
use WP_REST_Request;
use WP_REST_Response;

/** Same shape as SentryConsentController, minus the "never decided" null state. */
class UsageStatsController
{
    use RequiresManageOptionsCapability;

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/usage-stats/consent', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_consent'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_consent'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'enabled' => [
                        'required' => true,
                        'type'     => 'boolean',
                    ],
                ],
            ],
        ]);
    }

    public function get_consent(): WP_REST_Response
    {
        return new WP_REST_Response(['enabled' => UsageStats::isEnabled()], 200);
    }

    public function update_consent(WP_REST_Request $request): WP_REST_Response
    {
        $enabled = (bool) $request->get_param('enabled');
        // Stored as 0/1, not a bool: update_option($name, false) on an option that doesn't exist
        // yet is a silent no-op (get_option() already returns false for it), so the very first
        // opt-out would never persist and isEnabled() would keep its "absent = on" default.
        update_option(UsageStats::OPTION, (int) $enabled);
        // Read back rather than trust update_option()'s return: it is also false for an unchanged
        // value. A failed opt-out must not show as saved while pings keep going out.
        if (UsageStats::isEnabled() !== $enabled) {
            return new WP_REST_Response(['error' => 'Could not save the usage statistics preference.'], 500);
        }

        return new WP_REST_Response(['enabled' => $enabled], 200);
    }
}
