<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Api\ApiNamespace;
use PHPUnit\Framework\TestCase;

class ApiNamespaceTest extends TestCase
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

    public function test_current_returns_the_default_when_never_configured(): void
    {
        Functions\when('get_option')->justReturn(ApiNamespace::DEFAULT);

        $this->assertSame(ApiNamespace::DEFAULT, ApiNamespace::current());
    }

    public function test_current_returns_a_configured_value(): void
    {
        Functions\when('get_option')->justReturn('my-headless-api/v1');

        $this->assertSame('my-headless-api/v1', ApiNamespace::current());
    }

    // Only reachable via a direct DB edit, since update_namespace() validates before saving:
    // must never let a malformed stored value break every route at boot.
    public function test_current_falls_back_to_default_when_the_stored_value_is_malformed(): void
    {
        Functions\when('get_option')->justReturn('has spaces');

        $this->assertSame(ApiNamespace::DEFAULT, ApiNamespace::current());
    }

    public function test_is_valid_accepts_a_well_formed_namespace(): void
    {
        $this->assertTrue(ApiNamespace::isValid('my-headless-api/v1'));
        $this->assertTrue(ApiNamespace::isValid('my-headless-api/v12'));
    }

    public function test_is_valid_rejects_the_reserved_management_namespace(): void
    {
        $this->assertFalse(ApiNamespace::isValid('loopress/v1'));
    }

    public function test_is_valid_rejects_malformed_input(): void
    {
        $this->assertFalse(ApiNamespace::isValid(''));
        $this->assertFalse(ApiNamespace::isValid('has spaces/v1'));
        $this->assertFalse(ApiNamespace::isValid('no-version'));
        $this->assertFalse(ApiNamespace::isValid(123));
    }
}
