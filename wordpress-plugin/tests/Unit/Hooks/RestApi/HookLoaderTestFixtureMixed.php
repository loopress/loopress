<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\RestApi;

use Loopress\Hooks\Attribute\Action;
use Loopress\Hooks\Attribute\Cron;
use Loopress\Hooks\Attribute\Filter;

final class HookLoaderTestFixtureMixed
{
    #[Action('init')]
    public function onInit(): void
    {
    }

    #[Filter('the_content')]
    public function tweak(string $content): string
    {
        return $content;
    }

    #[Cron('hourly')]
    public function cleanup(): void
    {
    }
}
