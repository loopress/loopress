<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\RestApi;

use Loopress\Hooks\Attribute\Action;

final class HookLoaderTestFixtureAction
{
    public array $calledWith = [];

    #[Action('init', priority: 20, acceptedArgs: 2)]
    public function onInit(string $a, string $b): void
    {
        $this->calledWith = [$a, $b];
    }
}
