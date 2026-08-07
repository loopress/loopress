<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use WP_REST_Request;

final class RouteLoaderTestFixtureSharedPermissionCheck
{
    public static function checkApiKey(WP_REST_Request $request): bool
    {
        return $request->get_param('api_key') === 'secret';
    }
}
