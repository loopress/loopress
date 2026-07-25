<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

final class RouteLoaderTestFixtureWithOverrides
{
    public function get(): array
    {
        return [];
    }

    public function permission(): callable
    {
        return fn(): bool => true;
    }

    public function headers(): array
    {
        return ['Access-Control-Allow-Origin' => 'https://example.com'];
    }
}
