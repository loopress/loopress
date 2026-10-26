<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Loopress\Api\Attribute\Permission;

#[Permission(callback: [RouteLoaderTestFixtureSharedPermissionCheck::class, 'checkApiKey'])]
final class RouteLoaderTestFixturePermissionAttributeSharedCallback
{
    /** @return array<string, mixed> */
    public function get(): array
    {
        return [];
    }
}
