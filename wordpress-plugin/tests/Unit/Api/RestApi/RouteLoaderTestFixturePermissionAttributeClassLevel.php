<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Loopress\Api\Attribute\Permission;

#[Permission(public: true)]
final class RouteLoaderTestFixturePermissionAttributeClassLevel
{
    public function get(): array
    {
        return [];
    }

    public function post(): array
    {
        return [];
    }
}
