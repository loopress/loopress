<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Loopress\Api\Attribute\Cron;

final class RouteLoaderTestFixtureCron
{
    public function get(): array
    {
        return ['ok' => true];
    }

    #[Cron('daily')]
    public function cleanup(): void
    {
    }
}
