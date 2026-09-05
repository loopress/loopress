<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Loopress\Api\Attribute\Cron;

final class RouteLoaderTestFixtureCronOnly
{
    #[Cron('hourly')]
    public function cleanup(): void
    {
    }
}
