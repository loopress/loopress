<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Loopress\Api\Attribute\Permission;

#[Permission(capability: 'edit_posts')]
final class RouteLoaderTestFixturePermissionAttributeMethodOverridesClass
{
    /** @return array<string, mixed> */
    #[Permission(public: true)]
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
