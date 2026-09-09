<?php

declare(strict_types=1);

namespace Loopress\Options\Module;

use Loopress\Contract\Module;
use Loopress\Options\RestApi\OptionsController;
use Loopress\Options\Service\OptionsService;

class OptionsModule implements Module
{
    private OptionsService $service;

    public function __construct()
    {
        $this->service = new OptionsService();
    }

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new OptionsController($this->service))->register_routes();
        });
    }
}
