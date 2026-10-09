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

    // Recording is one option read and write plus a few list reads; a lock held longer than this
    // means something is stuck, better a clear 503 than a request hanging (see PagesController).
    private const LOCK_TIMEOUT_SECONDS = 10;

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
        global $wpdb;

        // record() reads the log option, then writes it back: two pushes finishing at the same
        // moment (two CI jobs on one site) would each drop the other's entry. Same MySQL named
        // lock as PagesController, scoped by table prefix, released by MySQL if the request dies.
        $lock = $wpdb->prefix . 'loopress_push_log_record';
        if ((string) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, %d)', $lock, self::LOCK_TIMEOUT_SECONDS)) !== '1') {
            return new WP_REST_Response(['error' => 'Another push is still being recorded on this site. Try again in a moment.'], 503);
        }

        try {
            return new WP_REST_Response($this->log->record((string) $request->get_param('resource')), 201);
        } finally {
            $wpdb->query($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock));
        }
    }
}
