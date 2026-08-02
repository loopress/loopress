<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\RestApi\RequiresManageOptionsCapability;
use PHPUnit\Framework\TestCase;

class RequiresManageOptionsCapabilityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_permission_callback_grants_access_when_the_current_user_can_manage_options(): void
    {
        Functions\expect('current_user_can')->once()->with('manage_options')->andReturn(true);

        $subject = $this->makeSubject();

        $this->assertTrue(($subject->permissionCallbackForTest())());
    }

    public function test_permission_callback_denies_access_when_the_current_user_cannot_manage_options(): void
    {
        Functions\expect('current_user_can')->once()->with('manage_options')->andReturn(false);

        $subject = $this->makeSubject();

        $this->assertFalse(($subject->permissionCallbackForTest())());
    }

    private function makeSubject(): object
    {
        return new class() {
            use RequiresManageOptionsCapability;

            public function permissionCallbackForTest(): callable
            {
                return $this->permissionCallback();
            }
        };
    }
}
