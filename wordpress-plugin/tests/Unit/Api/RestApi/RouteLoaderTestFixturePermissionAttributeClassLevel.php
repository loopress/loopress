<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Loopress\Api\Attribute\Permission;

#[Permission(public: true)]
final class RouteLoaderTestFixturePermissionAttributeClassLevel
{
    /** @return array<string, mixed> */
    public function get(): array
    {
        return [];
    }

    /** @return array<string, mixed> */
    public function post(): array
    {
        return [];
    }
}
