<?php

namespace Loopress\RestApi;

use Loopress\Service\SettingsService;
use WP_REST_Response;

class SettingsController
{
    public function __construct(private SettingsService $settingsService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/settings', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_settings'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);
    }

    public function get_settings(): WP_REST_Response
    {
        return new WP_REST_Response($this->settingsService->getSettings());
    }
}
