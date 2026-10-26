<?php

declare(strict_types=1);

namespace Loopress\Capabilities\Module;

use Loopress\Capabilities\RestApi\CapabilitiesController;
use Loopress\Contract\Module;

final readonly class CapabilitiesModule implements Module
{
    public function __construct(private CapabilitiesController $capabilities) {}

    public function boot(): void
    {
        add_action('rest_api_init', $this->capabilities->register_routes(...));
    }
}
