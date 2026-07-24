<?php

declare(strict_types=1);

namespace Loopress\Settings\Module;

use Loopress\Contract\Module;
use Loopress\Settings\RestApi\SettingsController;

class SettingsModule implements Module
{
    public function boot(): void
    {
        add_action('rest_api_init', fn() => (new SettingsController())->register_routes());
    }
}
