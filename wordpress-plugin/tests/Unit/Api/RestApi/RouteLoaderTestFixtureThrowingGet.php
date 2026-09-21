<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

final class RouteLoaderTestFixtureThrowingGet
{
    public function get(): array
    {
        throw new \RuntimeException('boom');
    }
}
