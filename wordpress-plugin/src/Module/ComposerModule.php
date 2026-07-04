<?php

namespace Loopress\Module;

use Loopress\Contract\Module;
use Loopress\Infrastructure\ComposerRunner;
use Loopress\Infrastructure\LoopressEnvironment;
use Loopress\Infrastructure\PackagistClient;
use Loopress\RestApi\ComposerController;
use Loopress\Service\ComposerService;

class ComposerModule implements Module
{
    private ComposerService $service;

    public function __construct(LoopressEnvironment $env)
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
    }
}
