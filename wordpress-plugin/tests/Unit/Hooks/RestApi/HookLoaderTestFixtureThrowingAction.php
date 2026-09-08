<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\RestApi;

use Loopress\Hooks\Attribute\Action;

final class HookLoaderTestFixtureThrowingAction
{
    #[Action('init')]
    public function onInit(): void
    {
        throw new \RuntimeException('boom');
    }
}
