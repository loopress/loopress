<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Module;

use Loopress\Contract\Module;
use Loopress\PostTypes\RestApi\DeclaredTypesController;
use Loopress\PostTypes\Service\PostMetaService;
use Loopress\PostTypes\Service\PostTypeService;
use Loopress\PostTypes\Service\RoleService;
use Loopress\PostTypes\Service\TaxonomyService;

// Post types (`lps cpt`), taxonomies (`lps taxonomy`), post meta keys (`lps meta`) and roles
// (`lps role`) declared as JSON files.
final readonly class PostTypesModule implements Module
{
    private PostTypeService $postTypes;
    private TaxonomyService $taxonomies;
    private PostMetaService $postMeta;
    private RoleService $roles;

    public function __construct()
    {
        $this->postTypes  = new PostTypeService();
        $this->taxonomies = new TaxonomyService();
        $this->postMeta   = new PostMetaService();
        $this->roles      = new RoleService();
    }

    public function boot(): void
    {
        // Priority 9, before the default 10: plugins that read post types during `init` and cache
        // them (Rank Math's labels) see ours. A slug registered earlier is skipped, one registered
        // again later replaces ours: both are reported as a conflict (AbstractDeclaredTypeService::
        // register() and isOurs()). Taxonomies one step earlier (8), the order WordPress
        // recommends for rewrite rules.
        add_action('init', [$this->taxonomies, 'register'], 8);
        add_action('init', [$this->postTypes, 'register'], 9);
        // Post meta after the post types, so a key whose post type comes from cpt/ finds it registered.
        add_action('init', [$this->postMeta, 'register'], 21);
        // One flag for post types and taxonomies (AbstractDeclaredTypeService::FLUSH_OPTION), so one flush.
        add_action('init', [$this->postTypes, 'flushIfNeeded'], 21);
        // WP_Roles is built right after plugins_loaded, when this runs, and again on switch_to_blog().
        add_action('wp_roles_init', [$this->roles, 'registerOn']);
        if (did_action('wp_roles_init') > 0) {
            $this->roles->registerOn(wp_roles());
        }
        add_filter('pre_update_option', [$this->roles, 'keepOutOfDatabase'], 10, 2);
        add_action('rest_api_init', function (): void {
            (new DeclaredTypesController($this->postTypes, 'post-types', 'Post type'))->register_routes();
            (new DeclaredTypesController($this->taxonomies, 'taxonomies', 'Taxonomy'))->register_routes();
            (new DeclaredTypesController($this->postMeta, 'post-meta', 'Post meta'))->register_routes();
            (new DeclaredTypesController($this->roles, 'roles', 'Role'))->register_routes();
        });
    }
}
