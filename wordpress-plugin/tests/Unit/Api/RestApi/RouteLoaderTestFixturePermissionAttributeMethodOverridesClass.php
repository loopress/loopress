<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Loopress\Api\Attribute\Permission;

#[Permission(capability: 'edit_posts')]
final class RouteLoaderTestFixturePermissionAttributeMethodOverridesClass
{
    #[Permission(public: true)]
    public function get(): array
    {
        return [];
    }

    public function post(): array
    {
        return [];
    }
}
