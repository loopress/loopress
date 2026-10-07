<?php

declare(strict_types=1);

namespace Loopress\Acf\Module;

use Loopress\Acf\RestApi\AcfController;
use Loopress\Acf\Service\AcfService;
use Loopress\Contract\Module;

class AcfModule implements Module
{
    public function __construct(private readonly AcfService $service) {}

    public function boot(): void
    {
        add_action('rest_api_init', function (): void {
            (new AcfController($this->service))->register_routes();
        });
    }
}
