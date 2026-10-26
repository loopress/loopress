<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

final class RouteLoaderTestFixtureThrowingHeaders
{
    /** @return array<string, mixed> */
    public function get(): array
    {
        return [];
    }

    /** @return array<string, mixed> */
    public function headers(): array
    {
        throw new \RuntimeException('boom');
    }
}
