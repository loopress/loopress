<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Module;

use Loopress\Contract\Module;
use Loopress\PostTypes\RestApi\PostTypesController;
use Loopress\PostTypes\Service\PostTypeService;

class PostTypesModule implements Module
{
    private readonly PostTypeService $service;

    public function __construct()
    {
        $this->service = new PostTypeService();
    }

    public function boot(): void
    {
        // Priority 20, after the default 10 most themes and plugins (CPT UI included) use: a slug
        // they already registered is then skipped instead of silently overwritten (see
        // PostTypeService::register()). Code that needs a Loopress post type during `init` must
        // run after 20 too.
        add_action('init', [$this->service, 'register'], 20);
        add_action('init', [$this->service, 'flushIfNeeded'], 21);
        add_action('rest_api_init', function (): void {
            (new PostTypesController($this->service))->register_routes();
        });
    }
}
