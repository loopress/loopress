<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use WP_REST_Request;

final class RouteLoaderTestFixtureWithOverrides
{
    /** @return array<string, mixed> */
    public function get(): array
    {
        return [];
    }

    public function permission(WP_REST_Request $request): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function headers(): array
    {
        return ['Access-Control-Allow-Origin' => 'https://example.com'];
    }
}
