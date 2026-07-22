<?php

declare(strict_types=1);

namespace Loopress\Seo\Module;

use Loopress\Contract\Module;
use Loopress\Seo\RestApi\SeoController;
use Loopress\Seo\Service\RankMathService;
use Loopress\Seo\Service\SeoService;
use Loopress\Seo\Service\YoastService;

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
