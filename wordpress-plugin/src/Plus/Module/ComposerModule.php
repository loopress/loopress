<?php

namespace Loopress\Plus\Module;

use Loopress\Contract\Module;
use Loopress\Plus\Infrastructure\ComposerRunner;
use Loopress\Plus\Infrastructure\LoopressEnvironment;
use Loopress\Plus\Infrastructure\PackagistClient;
use Loopress\Plus\RestApi\ComposerController;
use Loopress\Plus\Service\ComposerService;

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
