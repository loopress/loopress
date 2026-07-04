<?php

namespace Loopress\Tests\Unit\Service;

use Brain\Monkey;
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

    // ── getSettings ──────────────────────────────────────────────────────────

    public function test_get_settings_returns_expected_shape(): void
    {
        $service  = new SettingsService();
        $settings = $service->getSettings();

        $this->assertArrayHasKey('environment', $settings);
        $this->assertIsString($settings['environment']);
    }
}
