<?php

declare(strict_types=1);

namespace Loopress\Pages\Module;

use Loopress\Contract\Module;
use Loopress\Pages\Frontend\PageFilters;
use Loopress\Pages\RestApi\PagesController;
use Loopress\Pages\RestApi\ChildThemeController;

class PagesModule implements Module
{
    public function boot(): void
    {
        // Push log entries reported by this feature's `lps` command (the shared Pushes module
        // reads them through this filter, never referenced from here by class).
        add_filter('loopress_push_resources', static fn(array $resources): array => $resources + [
            'page:push'           => ['label' => 'Pages', 'routes' => ['/pages']],
            'theme:template:push' => ['label' => 'Block templates', 'routes' => ['/child-theme']],
        ]);

        add_action('rest_api_init', fn() => (new PagesController())->register_routes());
        add_action('rest_api_init', fn() => (new ChildThemeController())->register_routes());
        (new PageFilters())->register();
    }
}
