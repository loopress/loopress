<?php

declare(strict_types=1);

namespace Loopress\Sentry\RestApi;

use Loopress\RestApi\RequiresManageOptionsCapability;
use Loopress\Sentry\Consent;
use WP_REST_Request;
use WP_REST_Response;

class SentryConsentController
{
    use RequiresManageOptionsCapability;

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/sentry/consent', [
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
        return new WP_REST_Response(['enabled' => Consent::status()], 200);
    }

    public function update_consent(WP_REST_Request $request): WP_REST_Response
    {
        $enabled = (bool) $request->get_param('enabled');
        update_option(Consent::OPTION, $enabled);

        return new WP_REST_Response(['enabled' => $enabled], 200);
    }
}
