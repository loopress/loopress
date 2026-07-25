<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

final class RouteLoaderTestFixtureGet
{
    public function get(): array
    {
        return ['ok' => true];
    }

    private function post(): array
    {
        return [];
    }
}
