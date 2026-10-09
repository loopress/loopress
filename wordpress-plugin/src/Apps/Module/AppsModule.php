<?php

declare(strict_types=1);

namespace Loopress\Apps\Module;

use Loopress\Apps\Frontend\AppAssetEnqueuer;
use Loopress\Apps\Frontend\AppShortcode;
use Loopress\Apps\Infrastructure\AppsDirectory;
use Loopress\Apps\RestApi\AppsController;
use Loopress\Apps\Service\AppsDiagnostics;
use Loopress\Contract\Module;
use Loopress\Infrastructure\SiteHealth;

class AppsModule implements Module
{
    public function __construct(
        private readonly AppsController $controller,
        private readonly AppShortcode $shortcode,
        private readonly AppAssetEnqueuer $enqueuer,
        private readonly AppsDirectory $directory,
        private readonly AppsDiagnostics $diagnostics,
    ) {}

    public function boot(): void
    {
        // Push log entries reported by this feature's `lps` command (the shared Pushes module
        // reads them through this filter, never referenced from here by class).
        add_filter('loopress_push_resources', static fn(array $resources): array => $resources + ['app:push' => ['label' => 'Single-page apps', 'routes' => ['/apps']]]);

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

        SiteHealth::register(
            'loopress_apps',
            'Loopress single-page apps',
            'code',
            fn(): array => $this->diagnostics->getDiagnostics()['issues'],
        );
    }
}
