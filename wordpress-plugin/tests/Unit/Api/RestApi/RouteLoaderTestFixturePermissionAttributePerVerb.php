<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Loopress\Api\Attribute\Permission;

final class RouteLoaderTestFixturePermissionAttributePerVerb
{
    #[Permission(public: true)]
    public function get(): array
    {
        return [];
    }

    #[Permission(capability: 'edit_posts')]
    public function post(): array
    {
        return [];
    }
}
