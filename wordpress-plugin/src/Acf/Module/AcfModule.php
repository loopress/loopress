<?php

declare(strict_types=1);

namespace Loopress\Module;

use Loopress\Contract\Module;
use Loopress\RestApi\AcfController;
use Loopress\Service\AcfService;

class AcfModule implements Module
{
    private AcfService $service;

    public function __construct()
    {
        $this->service = new AcfService();
    }

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new AcfController($this->service))->register_routes();
        });
    }
}
