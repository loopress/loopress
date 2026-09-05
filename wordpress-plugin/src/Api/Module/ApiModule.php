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
        private ApiFilesController $controller,
        private ApiNamespaceController $namespaceController,
        private RouteLoader $routeLoader,
    ) {}

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            $this->controller->register_routes();
            $this->namespaceController->register_routes();
            $this->routeLoader->loadAndRegister();
        });

        // Separate from the rest_api_init pass above: a #[Cron] method's add_action binding has
        // to be in place before WP-Cron actually fires the event, and a wp-cron.php
        // pseudo-request never triggers rest_api_init (see RouteLoader::registerCronJobs()).
        add_action('init', function () {
            $this->routeLoader->registerCronJobs();
        });
    }
}
