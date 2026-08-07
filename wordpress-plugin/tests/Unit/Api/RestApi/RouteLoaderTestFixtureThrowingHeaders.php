<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

final class RouteLoaderTestFixtureThrowingHeaders
{
    public function get(): array
    {
        return [];
    }

    public function headers(): array
    {
        throw new \RuntimeException('boom');
    }
}
