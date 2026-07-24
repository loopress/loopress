<?php

declare(strict_types=1);

namespace Loopress\Settings\RestApi;

use Loopress\RestApi\RequiresManageOptionsCapability;
use Loopress\Sentry\Consent;
use WP_REST_Response;

/**
 * One reset button for every Loopress setting, not one per feature: add a new feature's
 * option constant to RESETTABLE_OPTIONS below when it grows one, rather than giving each
 * feature its own reset endpoint.
 */
class SettingsController
{
    use RequiresManageOptionsCapability;

    private const RESETTABLE_OPTIONS = [
        Consent::OPTION,
    ];

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/settings', [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'reset'],
            'permission_callback' => $this->permissionCallback(),
        ]);
    }

    public function reset(): WP_REST_Response
    {
        foreach (self::RESETTABLE_OPTIONS as $option) {
            delete_option($option);
        }

        return new WP_REST_Response(['reset' => true], 200);
    }
}
