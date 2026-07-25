<?php

declare(strict_types=1);

namespace Loopress\Api\Module;

use Loopress\Api\RestApi\ApiFilesController;
use Loopress\Api\RestApi\RouteLoader;
use Loopress\Contract\Module;

class ApiModule implements Module
{
    public function __construct(
        private ApiFilesController $controller,
        private RouteLoader $routeLoader,
    ) {}

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            $this->controller->register_routes();
            $this->routeLoader->loadAndRegister();
        });
    }
}
