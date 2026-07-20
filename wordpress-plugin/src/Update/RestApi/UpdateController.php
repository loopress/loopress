<?php

namespace Loopress\Update\RestApi;

use Loopress\Update\Infrastructure\GithubReleaseChecker;
use WP_REST_Request;
use WP_REST_Response;

class UpdateController
{
    public function __construct(private GithubReleaseChecker $checker) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/update', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_status'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);
    }

    public function get_status(WP_REST_Request $request): WP_REST_Response
    {
        $latest    = $this->checker->getLatestVersion();
        $available = $latest !== null && version_compare($latest, LOOPRESS_VERSION, '>');

        return new WP_REST_Response([
            'current_version'  => LOOPRESS_VERSION,
            'latest_version'   => $latest,
            'update_available' => $available,
            'release_url'      => $available ? $this->releaseUrl($latest) : null,
        ], 200);
    }

    private function releaseUrl(string $version): string
    {
        return 'https://github.com/loopress/loopress/releases/tag/' . rawurlencode('wordpress-plugin@' . $version);
    }
}
