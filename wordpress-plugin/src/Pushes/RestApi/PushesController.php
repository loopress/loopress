<?php

declare(strict_types=1);

namespace Loopress\Pushes\RestApi;

use Loopress\Pushes\PushLog;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

/**
 * POST: the CLI reports a finished `lps <resource> push`. GET: the admin's Overview tab.
 */
class PushesController
{
    use RequiresManageOptionsCapability;

    public function __construct(private readonly PushLog $log) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/pushes', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'summary'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'record'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'resource' => [
                        'required' => true,
                        'type'     => 'string',
                        'enum'     => array_keys(PushLog::resources()),
                    ],
                ],
            ],
        ]);
    }

    public function summary(): WP_REST_Response
    {
        return new WP_REST_Response($this->log->summary(), 200);
    }

    public function record(WP_REST_Request $request): WP_REST_Response
    {
        return new WP_REST_Response($this->log->record((string) $request->get_param('resource')), 201);
    }
}
