<?php

namespace Loopress\RestApi;

use Loopress\Exception\ConcurrentOperationException;
use Loopress\Exception\ProductionLockException;
use Loopress\Service\ComposerService;
use WP_REST_Request;
use WP_REST_Response;

class ComposerController
{
    public function __construct(private ComposerService $composerService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/composer/require', [
            'methods'             => 'POST',
            'callback'            => [$this, 'require_package'],
            'permission_callback' => fn() => current_user_can('manage_options'),
            'args'                => [
                'package' => $this->packageArg(required: true),
                'version' => $this->versionArg(required: false, default: '*'),
            ],
        ]);

        register_rest_route('loopress/v1', '/composer/remove', [
            'methods'             => 'POST',
            'callback'            => [$this, 'remove_package'],
            'permission_callback' => fn() => current_user_can('manage_options'),
            'args'                => [
                'package' => $this->packageArg(required: true),
            ],
        ]);

        register_rest_route('loopress/v1', '/composer/versions', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_versions'],
            'permission_callback' => fn() => current_user_can('manage_options'),
            'args'                => [
                'package' => $this->packageArg(required: true),
            ],
        ]);

        register_rest_route('loopress/v1', '/composer/installed', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_installed'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/composer/repair', [
            'methods'             => 'POST',
            'callback'            => [$this, 'repair'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/composer/diagnostics', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_diagnostics'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/composer/audit', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_audit'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/composer/fix-platform', [
            'methods'             => 'POST',
            'callback'            => [$this, 'fix_platform'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/composer/lock', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_lock'],
            'permission_callback' => fn() => current_user_can('manage_options'),
        ]);

        register_rest_route('loopress/v1', '/composer/sync', [
            'methods'             => 'POST',
            'callback'            => [$this, 'sync'],
            'permission_callback' => fn() => current_user_can('manage_options'),
            'args'                => [
                'composerJson' => [
                    'required' => true,
                    'type'     => 'string',
                ],
                'composerLock' => [
                    'required' => false,
                    'type'     => 'string',
                ],
            ],
        ]);
    }

    public function get_versions(WP_REST_Request $request): WP_REST_Response
    {
        try {
            $versions = $this->composerService->getVersions($request->get_param('package'));
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
        return new WP_REST_Response($this->composerService->getInstalled(), 200);
    }

    public function require_package(WP_REST_Request $request): WP_REST_Response
    {
        $package = $request->get_param('package');
        $version = $request->get_param('version');

        try {
            $output = $this->composerService->requirePackage($package, $version);
            return new WP_REST_Response(['message' => "{$package}:{$version} installed successfully.", 'output' => $output], 200);
        } catch (ProductionLockException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 403);
        } catch (ConcurrentOperationException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => "Failed to install {$package}:{$version}.", 'output' => $e->getMessage()], 500);
        }
    }

    public function remove_package(WP_REST_Request $request): WP_REST_Response
    {
        $package = $request->get_param('package');

        try {
            $output = $this->composerService->removePackage($package);
            return new WP_REST_Response(['message' => "{$package} removed successfully.", 'output' => $output], 200);
        } catch (ProductionLockException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 403);
        } catch (ConcurrentOperationException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => "Failed to remove {$package}.", 'output' => $e->getMessage()], 500);
        }
    }

    public function repair(WP_REST_Request $request): WP_REST_Response
    {
        try {
            $output = $this->composerService->repair();
            return new WP_REST_Response(['message' => 'Dependencies repaired successfully.', 'output' => $output], 200);
        } catch (ProductionLockException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 403);
        } catch (ConcurrentOperationException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => 'Repair failed.', 'output' => $e->getMessage()], 500);
        }
    }

    public function get_diagnostics(WP_REST_Request $request): WP_REST_Response
    {
        return new WP_REST_Response($this->composerService->getDiagnostics(), 200);
    }

    public function get_audit(WP_REST_Request $request): WP_REST_Response
    {
        try {
            return new WP_REST_Response($this->composerService->audit(), 200);
        } catch (ConcurrentOperationException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function fix_platform(WP_REST_Request $request): WP_REST_Response
    {
        try {
            $this->composerService->fixPlatform();
            return new WP_REST_Response([
                'message'      => 'config.platform.php updated to ' . PHP_VERSION,
                'php_version'  => PHP_VERSION,
                'platform_php' => PHP_VERSION,
            ], 200);
        } catch (ProductionLockException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 403);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }
    }

    public function get_lock(WP_REST_Request $request): WP_REST_Response
    {
        $lock = $this->composerService->getLock();

        if ($lock === null) {
            return new WP_REST_Response(['error' => 'composer.lock not found'], 404);
        }

        return new WP_REST_Response(['composerLock' => $lock], 200);
    }

    public function sync(WP_REST_Request $request): WP_REST_Response
    {
        $composerJson = $request->get_param('composerJson');
        $composerLock = $request->get_param('composerLock');

        try {
            $output = $this->composerService->sync($composerJson, $composerLock);
            return new WP_REST_Response(['message' => 'composer install completed.', 'output' => $output], 200);
        } catch (\InvalidArgumentException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 400);
        } catch (ProductionLockException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 403);
        } catch (ConcurrentOperationException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => 'Sync failed.', 'output' => $e->getMessage()], 500);
        }
    }

    /** @return array<string, mixed> */
    private function packageArg(bool $required): array
    {
        return [
            'required'          => $required,
            'type'              => 'string',
            'description'       => 'Composer package name (vendor/package)',
            'validate_callback' => fn($v) => (bool) preg_match('/^[a-z0-9][a-z0-9\._-]*\/[a-z0-9][a-z0-9\._-]*$/i', $v),
            'sanitize_callback' => 'sanitize_text_field',
        ];
    }

    /** @return array<string, mixed> */
    private function versionArg(bool $required, string $default = '*'): array
    {
        return [
            'required'          => $required,
            'default'           => $default,
            'type'              => 'string',
            'description'       => 'Composer version constraint',
            'validate_callback' => fn($v) => (bool) preg_match('/^[a-z0-9@\.\-\*\^~><=|,+ ]+$/i', $v),
            'sanitize_callback' => 'sanitize_text_field',
        ];
    }
}
