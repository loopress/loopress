<?php

namespace Loopress\Module;

use Loopress\Contract\Module;
use Loopress\RestApi\YoastController;
use Loopress\Service\YoastService;

class YoastModule implements Module
{
    private YoastService $service;

    public function __construct()
    {
        $this->service = new YoastService();
    }

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new YoastController($this->service))->register_routes();
        });
    }
}
