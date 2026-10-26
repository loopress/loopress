<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

final class RouteLoaderTestFixtureGet
{
    /** @return array<string, mixed> */
    public function get(): array
    {
        return ['ok' => true];
    }

    /** @return array<string, mixed> */
    private function post(): array
    {
        return [];
    }
}
