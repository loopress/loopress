<?php

declare(strict_types=1);

namespace Loopress\Pages\Module;

use Loopress\Contract\Module;
use Loopress\Pages\Frontend\PageFilters;
use Loopress\Pages\RestApi\PagesController;

class PagesModule implements Module
{
    public function boot(): void
    {
        add_action('rest_api_init', fn() => (new PagesController())->register_routes());
        (new PageFilters())->register();
    }
}
