<?php

namespace Loopress\Tests\Unit\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Exception\ProductionLockException;
use Loopress\Service\SettingsService;
use PHPUnit\Framework\TestCase;

class SettingsServiceTest extends TestCase
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

    // ── getEnvironment ────────────────────────────────────────────────────────

    public function test_returns_development_when_constant_not_defined(): void
    {
        $service = new SettingsService();
        $this->assertSame('development', $service->getEnvironment());
    }

    public function test_returns_constant_value_when_defined(): void
    {
        if (!defined('LOOPRESS_ENVIRONMENT')) {
            define('LOOPRESS_ENVIRONMENT', 'production'); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound
        }
        $service = new SettingsService();
        $this->assertSame('production', $service->getEnvironment());
    }

    // ── isLocked ─────────────────────────────────────────────────────────────

    public function test_not_locked_by_default(): void
    {
        Functions\when('get_option')->justReturn(false);
        $service = new SettingsService();
        $this->assertFalse($service->isLocked());
    }

    public function test_locked_when_option_is_true(): void
    {
        Functions\when('get_option')->justReturn(true);
        $service = new SettingsService();
        $this->assertTrue($service->isLocked());
    }

    // ── lockSource ────────────────────────────────────────────────────────────

    public function test_lock_source_is_ui_when_not_constant(): void
    {
        $service = new SettingsService();
        $this->assertSame('ui', $service->lockSource());
    }

    // ── getSettings ──────────────────────────────────────────────────────────

    public function test_get_settings_returns_expected_shape(): void
    {
        Functions\when('get_option')->justReturn(false);
        $service  = new SettingsService();
        $settings = $service->getSettings();

        $this->assertArrayHasKey('environment', $settings);
        $this->assertArrayHasKey('production_lock', $settings);
        $this->assertArrayHasKey('lock_source', $settings);
        $this->assertIsBool($settings['production_lock']);
        $this->assertIsString($settings['environment']);
        $this->assertIsString($settings['lock_source']);
    }

    // ── updateLock ────────────────────────────────────────────────────────────

    public function test_update_lock_calls_update_option(): void
    {
        Functions\expect('update_option')
            ->once()
            ->with('loopress_production_lock', true);

        $service = new SettingsService();
        $service->updateLock(true);
        $this->addToAssertionCount(1); // Brain Monkey expectation verified in tearDown
    }

    public function test_update_lock_to_false(): void
    {
        Functions\expect('update_option')
            ->once()
            ->with('loopress_production_lock', false);

        $service = new SettingsService();
        $service->updateLock(false);
        $this->addToAssertionCount(1);
    }

    public function test_update_lock_throws_when_locked_via_constant(): void
    {
        if (!defined('LOOPRESS_PRODUCTION_LOCK')) {
            define('LOOPRESS_PRODUCTION_LOCK', true); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound
        }

        $service = new SettingsService();
        $this->expectException(ProductionLockException::class);
        $service->updateLock(false);
    }
}
