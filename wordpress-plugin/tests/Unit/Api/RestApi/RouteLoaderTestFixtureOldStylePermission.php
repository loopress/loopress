<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

final class RouteLoaderTestFixtureOldStylePermission
{
    /** @return array<string, mixed> */
    public function get(): array
    {
        return [];
    }

    // Pre-api-permission-direct-callback convention: permission() returned a callable to be
    // invoked later, rather than being the permission_callback itself. Deliberately never
    // called by the fixture: the whole point is that the wrapper must reject this return
    // shape outright, not evaluate the closure it points to.
    /** @return callable(): bool */
    public function permission(): callable
    {
        return fn(): bool => false;
    }
}
