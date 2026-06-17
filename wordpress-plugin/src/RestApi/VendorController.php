<?php

namespace Loopress\RestApi;

use Loopress\Service\VendorService;
use WP_REST_Request;
use WP_REST_Response;

class VendorController
{
    public function __construct(private VendorService $vendorService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/vendor/require', [
            'methods'             => 'POST',
            'callback'            => [$this, 'require_package'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/vendor/remove', [
            'methods'             => 'POST',
            'callback'            => [$this, 'remove_package'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/vendor/versions', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_versions'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/vendor/installed', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_installed'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/vendor/repair', [
            'methods'             => 'POST',
            'callback'            => [$this, 'repair'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/vendor/diagnostics', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_diagnostics'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/vendor/audit', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_audit'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/vendor/fix-platform', [
            'methods'             => 'POST',
            'callback'            => [$this, 'fix_platform'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);
    }

    public function get_versions(WP_REST_Request $request): WP_REST_Response
    {
        $package = $request->get_param('package');

        if (empty($package) || !preg_match('/^[a-z0-9][a-z0-9\._-]*\/[a-z0-9][a-z0-9\._-]*$/i', $package)) {
            return new WP_REST_Response(['error' => 'Invalid package name'], 400);
        }

        try {
            $versions = $this->vendorService->getVersions($package);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        if ($versions === null) {
            return new WP_REST_Response(['error' => 'Package not found'], 404);
        }

        return new WP_REST_Response($versions);
    }

    public function get_installed(WP_REST_Request $request): WP_REST_Response
    {
        return new WP_REST_Response($this->vendorService->getInstalled(), 200);
    }

    public function require_package(WP_REST_Request $request): WP_REST_Response
    {
        $package = $request->get_param('package');

        if (empty($package) || !preg_match('/^[a-z0-9][a-z0-9\._-]*\/[a-z0-9][a-z0-9\._-]*$/i', $package)) {
            return new WP_REST_Response(['error' => 'Invalid package name'], 400);
        }

        $version = $request->get_param('version') ?? '*';
        if (!preg_match('/^[v\^~\*]?[0-9a-z\.\-\*]+$/i', $version)) {
            return new WP_REST_Response(['error' => 'Invalid version constraint'], 400);
        }

        try {
            $output = $this->vendorService->requirePackage($package, $version);
            return new WP_REST_Response(['message' => "{$package}:{$version} installed successfully.", 'output' => $output], 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => "Failed to install {$package}:{$version}.", 'output' => $e->getMessage()], 500);
        }
    }

    public function remove_package(WP_REST_Request $request): WP_REST_Response
    {
        $package = $request->get_param('package');

        if (empty($package) || !preg_match('/^[a-z0-9][a-z0-9\._-]*\/[a-z0-9][a-z0-9\._-]*$/i', $package)) {
            return new WP_REST_Response(['error' => 'Invalid package name'], 400);
        }

        try {
            $output = $this->vendorService->removePackage($package);
            return new WP_REST_Response(['message' => "{$package} removed successfully.", 'output' => $output], 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => "Failed to remove {$package}.", 'output' => $e->getMessage()], 500);
        }
    }

    public function repair(WP_REST_Request $request): WP_REST_Response
    {
        try {
            $output = $this->vendorService->repair();
            return new WP_REST_Response(['message' => 'Dependencies repaired successfully.', 'output' => $output], 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => 'Repair failed.', 'output' => $e->getMessage()], 500);
        }
    }

    public function get_diagnostics(WP_REST_Request $request): WP_REST_Response
    {
        return new WP_REST_Response($this->vendorService->getDiagnostics(), 200);
    }

    public function get_audit(WP_REST_Request $request): WP_REST_Response
    {
        try {
            return new WP_REST_Response($this->vendorService->audit(), 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function fix_platform(WP_REST_Request $request): WP_REST_Response
    {
        try {
            $this->vendorService->fixPlatform();
            return new WP_REST_Response([
                'message'      => 'config.platform.php updated to ' . PHP_VERSION,
                'php_version'  => PHP_VERSION,
                'platform_php' => PHP_VERSION,
            ], 200);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }
}
