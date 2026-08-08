<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\Attribute;

use Loopress\Api\Attribute\Permission;
use PHPUnit\Framework\TestCase;

class PermissionTest extends TestCase
{
    public function test_accepts_public_alone(): void
    {
        $permission = new Permission(public: true);

        $this->assertTrue($permission->public);
    }

    public function test_accepts_capability_alone(): void
    {
        $permission = new Permission(capability: 'edit_posts');

        $this->assertSame('edit_posts', $permission->capability);
    }

    public function test_accepts_callback_alone(): void
    {
        $permission = new Permission(callback: 'checkSomething');

        $this->assertSame('checkSomething', $permission->callback);
    }

    public function test_accepts_no_options_at_all(): void
    {
        $permission = new Permission();

        $this->assertFalse($permission->public);
    }

    // RouteLoader::permissionFromAttribute() checks public, then callback, then capability,
    // in that order: combining more than one would otherwise silently pick whichever it
    // checks first instead of erroring.
    public function test_rejects_public_combined_with_capability(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        new Permission(public: true, capability: 'manage_options'); // NOSONAR (php:S1848) - constructor is expected to throw
    }

    public function test_rejects_public_combined_with_callback(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        new Permission(public: true, callback: 'checkSomething'); // NOSONAR (php:S1848) - constructor is expected to throw
    }

    public function test_rejects_capability_combined_with_callback(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        new Permission(capability: 'manage_options', callback: 'checkSomething'); // NOSONAR (php:S1848) - constructor is expected to throw
    }

    public function test_rejects_all_three_at_once(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        new Permission(public: true, capability: 'manage_options', callback: 'checkSomething'); // NOSONAR (php:S1848) - constructor is expected to throw
    }
}
