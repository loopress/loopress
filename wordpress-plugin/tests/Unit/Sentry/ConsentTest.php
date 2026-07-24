<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Sentry;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Sentry\Consent;
use PHPUnit\Framework\TestCase;

class ConsentTest extends TestCase
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

    public function test_status_is_null_when_the_admin_has_never_decided(): void
    {
        Functions\when('get_option')->justReturn(null);

        $this->assertNull(Consent::status());
    }

    public function test_status_reflects_an_explicit_false(): void
    {
        Functions\when('get_option')->justReturn(false);

        $this->assertFalse(Consent::status());
    }

    public function test_status_reflects_an_explicit_true(): void
    {
        Functions\when('get_option')->justReturn(true);

        $this->assertTrue(Consent::status());
    }

    public function test_is_enabled_is_false_when_never_decided(): void
    {
        Functions\when('get_option')->justReturn(null);

        $this->assertFalse(Consent::isEnabled());
    }

    public function test_is_enabled_is_false_when_explicitly_declined(): void
    {
        Functions\when('get_option')->justReturn(false);

        $this->assertFalse(Consent::isEnabled());
    }

    public function test_is_enabled_is_true_when_explicitly_allowed(): void
    {
        Functions\when('get_option')->justReturn(true);

        $this->assertTrue(Consent::isEnabled());
    }
}
