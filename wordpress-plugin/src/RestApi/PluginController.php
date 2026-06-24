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
        ]);

        register_rest_route('loopress/v1', '/plugins/auto-updates/disable', [
            'methods'             => 'POST',
            'callback'            => [$this, 'disable_auto_updates'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);
    }

    public function get_installed(WP_REST_Request $request): WP_REST_Response
    {
        return new WP_REST_Response($this->pluginService->getInstalled(), 200);
    }

    public function install_plugin(WP_REST_Request $request): WP_REST_Response
    {
        $slug = $request->get_param('slug');
        if (empty($slug) || !preg_match('/^[a-z0-9][a-z0-9\-]*$/', $slug)) {
            return new WP_REST_Response(['error' => 'Invalid plugin slug.'], 400);
        }

        $version = $request->get_param('version') ?? 'latest';
        if (!preg_match('/^(latest|[0-9]+\.[0-9]+(\.[0-9]+)?)$/', $version)) {
            return new WP_REST_Response(['error' => 'Invalid version. Use a semver string or "latest".'], 400);
        }

        try {
            $result = $this->pluginService->install($slug, $version);
            return new WP_REST_Response($result, 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function disable_auto_updates(WP_REST_Request $request): WP_REST_Response
    {
        $slugs = $request->get_param('slugs');
        if (!is_array($slugs) || empty($slugs)) {
            return new WP_REST_Response(['error' => 'slugs must be a non-empty array.'], 400);
        }

        $this->pluginService->disableAutoUpdatesForManaged($slugs);
        return new WP_REST_Response(['message' => 'Auto-updates disabled for managed plugins.'], 200);
    }
}
