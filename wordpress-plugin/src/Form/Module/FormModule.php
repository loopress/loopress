<?php

declare(strict_types=1);

namespace Loopress\Form\Module;

use Loopress\Contract\Module;
use Loopress\Form\RestApi\FormController;
use Loopress\Form\Service\FormService;

class FormModule implements Module
{
    public function __construct(private FormService $service) {}

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new FormController($this->service))->register_routes();
        });
    }
}
