<?php

declare(strict_types=1);

namespace Loopress\Apps\Module;

use Loopress\Apps\Frontend\AppAssetEnqueuer;
use Loopress\Apps\Frontend\AppShortcode;
use Loopress\Apps\Infrastructure\AppsDirectory;
use Loopress\Apps\RestApi\AppsController;
use Loopress\Contract\Module;

class AppsModule implements Module
{
    public function __construct(
        private AppsController $controller,
        private AppShortcode $shortcode,
        private AppAssetEnqueuer $enqueuer,
        private AppsDirectory $directory,
    ) {}

    public function boot(): void
    {
        add_action('rest_api_init', function (): void {
            $this->controller->register_routes();
        });

        add_action('init', function (): void {
            // ensureExists() also runs on rest_api_init (in the controller); repeated here so
            // a Git-based deploy that never calls `lps app push` still gets the anti-listing
            // index.php and the PHP-off .htaccess under apps/.
            $this->directory->ensureExists();
            add_shortcode(AppShortcode::TAG, [$this->shortcode, 'render']);
        });

        add_filter('script_loader_tag', [$this->enqueuer, 'filterModuleType'], 10, 2);
    }
}
