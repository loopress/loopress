<?php

declare(strict_types=1);

namespace Loopress\RestApi;

// Kept outside every Full-only src/ directory (see scripts/build-flavor.cjs) so both
// editions' REST controllers can use it. If the required capability ever needs to change
// (e.g. a dedicated Loopress capability instead of WordPress's built-in manage_options),
// this is the only place to edit.
trait RequiresManageOptionsCapability
{
    private function permissionCallback(): callable
    {
        return fn(): bool => current_user_can('manage_options');
    }
}
