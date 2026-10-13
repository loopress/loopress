<?php

declare(strict_types=1);

namespace Loopress\Update\RestApi;

use Loopress\RestApi\RequiresManageOptionsCapability;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use WP_REST_Request;
use WP_REST_Response;

class UpdateController
{
    use RequiresManageOptionsCapability;

    public function __construct(private GithubReleaseChecker $checker) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/update', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_status'],
            'permission_callback' => $this->permissionCallback(),
        ]);
        register_rest_route('loopress/v1', '/update/check', [
            'methods'             => 'POST',
            'callback'            => [$this, 'check_now'],
            'permission_callback' => $this->permissionCallback(),
        ]);
    }

    /**
     * The admin page's "Check for updates" button: asks GitHub now instead of trusting the 12h
     * cache, then refreshes WordPress's own update_plugins transient so the Plugins page offers
     * the update right away. The usage ping this can trigger keeps its own 12h guard (UsagePing).
     */
    public function check_now(WP_REST_Request $request): WP_REST_Response
    {
        $this->checker->forget();
        delete_site_transient('update_plugins');
        wp_update_plugins();

        return $this->get_status($request);
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
