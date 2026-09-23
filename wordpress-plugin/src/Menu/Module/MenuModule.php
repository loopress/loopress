<?php

declare(strict_types=1);

namespace Loopress\Menu\Module;

use Loopress\Contract\Module;
use Loopress\Menu\RestApi\MenuController;
use Loopress\Menu\Service\MenuService;

class MenuModule implements Module
{
    private MenuService $service;

    public function __construct()
    {
        $this->service = new MenuService();
    }

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new MenuController($this->service))->register_routes();
        });
    }
}
