<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Module;

use Loopress\Contract\Module;
use Loopress\Dependencies\RestApi\ComposerController;
use Loopress\Dependencies\Service\ComposerService;
use Loopress\Infrastructure\SiteHealth;

class ComposerModule implements Module
{
    public function __construct(
        private readonly ComposerService $service,
        private readonly ?string $autoloadError,
    ) {}

    public function boot(): void
    {
        // Push log entries reported by this feature's `lps` command (the shared Pushes module
        // reads them through this filter, never referenced from here by class).
        add_filter('loopress_push_resources', static fn(array $resources): array => $resources + [
            // All three land in the same composer.json through /composer/sync.
            'plugin:push'        => ['label' => 'Plugins', 'routes' => ['/composer/json']],
            'theme:version:push' => ['label' => 'Theme versions', 'routes' => ['/composer/json']],
            'composer:push'      => ['label' => 'Composer libraries', 'routes' => ['/composer/json']],
        ]);

        add_action('rest_api_init', fn() => (new ComposerController($this->service))->register_routes());

        // The shared AdminPageModule never references this module: it announces its
        // autoload health through this filter instead.
        add_filter('loopress_admin_data', function (array $data): array {
            $data['autoloadError']   = $this->autoloadError;
            $data['fileModsAllowed'] = ComposerController::fileModsAllowed();

            return $data;
        });

        SiteHealth::register(
            'loopress_composer',
            'Loopress Composer dependencies',
            'dependencies',
            fn(): array => $this->service->getDiagnostics()['issues'],
        );
    }
}
