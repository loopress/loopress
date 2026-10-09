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
