<?php

declare(strict_types=1);

namespace Loopress\Api\RestApi;

use Loopress\Api\ApiNamespace;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

class ApiNamespaceController
{
    use RequiresManageOptionsCapability;

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/api-namespace', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_namespace'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_namespace'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'namespace' => [
                        'required'          => true,
                        'validate_callback' => static fn($value): bool => ApiNamespace::isValid($value),
                    ],
                ],
            ],
        ]);
    }

    public function get_namespace(): WP_REST_Response
    {
        return new WP_REST_Response(['namespace' => ApiNamespace::current()], 200);
    }

    public function update_namespace(WP_REST_Request $request): WP_REST_Response
    {
        $namespace = (string) $request->get_param('namespace');
        update_option(ApiNamespace::OPTION, $namespace);

        return new WP_REST_Response(['namespace' => $namespace], 200);
    }
}
