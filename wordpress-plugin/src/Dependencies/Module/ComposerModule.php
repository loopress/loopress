<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Module;

use Loopress\Contract\Module;
use Loopress\Dependencies\RestApi\ComposerController;
use Loopress\Dependencies\Service\ComposerService;
use Loopress\Infrastructure\SiteHealth;

class ComposerModule implements Module
{
    // plugin, theme version and library pushes all land in this one file, through /composer/sync.
    private const COMPOSER_JSON_ROUTES = ['/composer/json'];

    public function __construct(
        private readonly ComposerService $service,
        private readonly ?string $autoloadError,
    ) {}

    public function boot(): void
    {
        // Push log entries reported by this feature's `lps` command (the shared Pushes module
        // reads them through this filter, never referenced from here by class).
        add_filter('loopress_push_resources', static fn(array $resources): array => $resources + [
            'plugin:push'        => ['label' => 'Plugins', 'routes' => self::COMPOSER_JSON_ROUTES],
            'theme:version:push' => ['label' => 'Theme versions', 'routes' => self::COMPOSER_JSON_ROUTES],
            'composer:push'      => ['label' => 'Composer libraries', 'routes' => self::COMPOSER_JSON_ROUTES],
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
