<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Module;

use Loopress\Contract\Module;
use Loopress\PostTypes\RestApi\DeclaredTypesController;
use Loopress\PostTypes\Service\PostTypeService;
use Loopress\PostTypes\Service\TaxonomyService;

// Post types (`lps cpt`) and taxonomies (`lps taxonomy`) declared as JSON files.
class PostTypesModule implements Module
{
    private readonly PostTypeService $postTypes;
    private readonly TaxonomyService $taxonomies;

    public function __construct()
    {
        $this->postTypes  = new PostTypeService();
        $this->taxonomies = new TaxonomyService();
    }

    public function boot(): void
    {
        // Priority 20, after the default 10 most themes and plugins (CPT UI included) use: a slug
        // they already registered is then skipped instead of silently overwritten (see
        // AbstractDeclaredTypeService::register()). Code that needs a Loopress post type or
        // taxonomy during `init` must run after 20 too. Taxonomies one step earlier (19), the
        // order WordPress recommends for rewrite rules.
        add_action('init', [$this->taxonomies, 'register'], 19);
        add_action('init', [$this->postTypes, 'register'], 20);
        // One flag for both (AbstractDeclaredTypeService::FLUSH_OPTION), so one flush.
        add_action('init', [$this->postTypes, 'flushIfNeeded'], 21);
        add_action('rest_api_init', function (): void {
            (new DeclaredTypesController($this->postTypes, 'post-types', 'Post type'))->register_routes();
            (new DeclaredTypesController($this->taxonomies, 'taxonomies', 'Taxonomy'))->register_routes();
        });
    }
}
