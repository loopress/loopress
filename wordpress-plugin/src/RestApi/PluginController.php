<?php

namespace Loopress\RestApi;

use Loopress\Service\PluginService;
use WP_REST_Request;
use WP_REST_Response;

class PluginController
{
    public function __construct(private PluginService $pluginService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/plugins', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_installed'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/plugins/install', [
            'methods'             => 'POST',
            'callback'            => [$this, 'install_plugin'],
            'permission_callback' => fn() => current_user_can('manage_options'),
            'args'                => [
                'slug'    => $this->slugArg(required: true),
                'version' => [
                    'required'          => false,
                    'default'           => 'latest',
                    'type'              => 'string',
                    'description'       => 'Plugin version or "latest"',
                    'validate_callback' => fn($v) => (bool) preg_match('/^(latest|[0-9]+\.[0-9]+(\.[0-9]+)?)$/', $v),
                    'sanitize_callback' => 'sanitize_text_field',
                ],
            ],
        ]);

        register_rest_route('loopress/v1', '/plugins/activate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'activate_plugin'],
            'permission_callback' => fn() => current_user_can('manage_options'),
            'args'                => [
                'slug' => $this->slugArg(required: true),
            ],
        ]);

        register_rest_route('loopress/v1', '/plugins/auto-updates/disable', [
            'methods'             => 'POST',
            'callback'            => [$this, 'disable_auto_updates'],
            'permission_callback' => fn() => current_user_can('manage_options'),
            'args'                => [
                'slugs' => [
                    'required'          => true,
                    'type'              => 'array',
                    'description'       => 'Plugin slugs to disable auto-updates for',
                    'items'             => ['type' => 'string'],
                    'validate_callback' => fn($v) => is_array($v) && !empty($v),
                ],
            ],
        ]);
    }

    public function get_installed(WP_REST_Request $request): WP_REST_Response
    {
        return new WP_REST_Response($this->pluginService->getInstalled(), 200);
    }

    public function activate_plugin(WP_REST_Request $request): WP_REST_Response
    {
        try {
            $result = $this->pluginService->activate($request->get_param('slug'));
            return new WP_REST_Response($result, 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function install_plugin(WP_REST_Request $request): WP_REST_Response
    {
        try {
            $result = $this->pluginService->install(
                $request->get_param('slug'),
                $request->get_param('version'),
            );
            return new WP_REST_Response($result, 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function disable_auto_updates(WP_REST_Request $request): WP_REST_Response
    {
        $this->pluginService->disableAutoUpdatesForManaged($request->get_param('slugs'));
        return new WP_REST_Response(['message' => 'Auto-updates disabled for managed plugins.'], 200);
    }

    /** @return array<string, mixed> */
    private function slugArg(bool $required): array
    {
        return [
            'required'          => $required,
            'type'              => 'string',
            'description'       => 'WordPress plugin slug',
            'validate_callback' => fn($v) => (bool) preg_match('/^[a-z0-9][a-z0-9\-]*$/', $v),
            'sanitize_callback' => 'sanitize_text_field',
        ];
    }
}
