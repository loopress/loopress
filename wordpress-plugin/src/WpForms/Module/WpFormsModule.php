<?php

declare(strict_types=1);

namespace Loopress\WpForms\Module;

use Loopress\Contract\Module;
use Loopress\WpForms\RestApi\WpFormsController;
use Loopress\WpForms\Service\WpFormsService;

class WpFormsModule implements Module
{
    private WpFormsService $service;

    public function __construct()
    {
        $this->service = new WpFormsService();
    }

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new WpFormsController($this->service))->register_routes();
        });
    }
}
