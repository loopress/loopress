<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

use Loopress\RestApi\RequiresManageOptionsCapability;

/**
 * Exposes the RequiresManageOptionsCapability trait to RequiresManageOptionsCapabilityTest. A
 * named class, not an anonymous one, so PHPStan knows permissionCallbackForTest() exists.
 */
final class RequiresManageOptionsCapabilityTestSubject
{
    use RequiresManageOptionsCapability;

    /** @return callable(mixed...): bool */
    public function permissionCallbackForTest(): callable
    {
        return $this->permissionCallback();
    }
}
