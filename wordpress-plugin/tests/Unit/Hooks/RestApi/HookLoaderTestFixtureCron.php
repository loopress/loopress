<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\RestApi;

use Loopress\Hooks\Attribute\Cron;

final class HookLoaderTestFixtureCron
{
    #[Cron('daily')]
    public function cleanup(): void
    {
    }
}
