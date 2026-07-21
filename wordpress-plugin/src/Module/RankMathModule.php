<?php

namespace Loopress\Module;

use Loopress\Contract\Module;
use Loopress\RestApi\RankMathController;
use Loopress\Service\RankMathService;

class RankMathModule implements Module
{
    private RankMathService $service;

    public function __construct()
    {
        $this->service = new RankMathService();
    }

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new RankMathController($this->service))->register_routes();
        });
    }
}
