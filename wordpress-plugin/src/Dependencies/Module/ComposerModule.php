<?php

namespace Loopress\Dependencies\Module;

use Loopress\Contract\Module;
use Loopress\Dependencies\Infrastructure\ComposerRunner;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Dependencies\Infrastructure\PackagistClient;
use Loopress\Dependencies\RestApi\ComposerController;
use Loopress\Dependencies\Service\ComposerService;

class ComposerModule implements Module
{
    private ComposerService $service;

    public function __construct(LoopressEnvironment $env, private ?string $autoloadError)
    {
        $this->service = new ComposerService(
            $env,
            new ComposerRunner($env),
            new PackagistClient(),
        );
    }

    public function boot(): void
    {
        add_action('rest_api_init', fn() => (new ComposerController($this->service))->register_routes());

        // The shared AdminPageModule never references this module: it announces its
        // autoload health through this filter instead.
        add_filter('loopress_admin_data', function (array $data): array {
            $data['autoloadError'] = $this->autoloadError;

            return $data;
        });
    }
}
