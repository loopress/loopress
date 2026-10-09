<?php

declare(strict_types=1);

namespace Loopress\Api\Module;

use Loopress\Api\RestApi\ApiFilesController;
use Loopress\Api\RestApi\ApiNamespaceController;
use Loopress\Api\RestApi\RouteLoader;
use Loopress\Contract\Module;

class ApiModule implements Module
{
    public function __construct(
        private readonly ApiFilesController $controller,
        private readonly ApiNamespaceController $namespaceController,
        private readonly RouteLoader $routeLoader,
    ) {}

    public function boot(): void
    {
        // Push log entries reported by this feature's `lps` command (the shared Pushes module
        // reads them through this filter, never referenced from here by class).
        add_filter('loopress_push_resources', static fn(array $resources): array => $resources + ['api:push' => ['label' => 'API routes', 'routes' => ['/api-files']]]);

        add_action('rest_api_init', function (): void {
            $this->controller->register_routes();
            $this->namespaceController->register_routes();
            $this->routeLoader->loadAndRegister();
        });
    }
}
