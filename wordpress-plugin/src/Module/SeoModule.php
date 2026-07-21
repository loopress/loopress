<?php

namespace Loopress\Module;

use Loopress\Contract\Module;
use Loopress\RestApi\SeoController;
use Loopress\Service\RankMathService;
use Loopress\Service\SeoService;
use Loopress\Service\YoastService;

class SeoModule implements Module
{
    private SeoService $service;

    public function __construct()
    {
        $this->service = new SeoService(new RankMathService(), new YoastService());
    }

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new SeoController($this->service))->register_routes();
        });
    }
}
