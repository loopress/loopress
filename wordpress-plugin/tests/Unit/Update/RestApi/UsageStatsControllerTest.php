<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Update\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Update\RestApi\UsageStatsController;
use Loopress\Update\UsageStats;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class UsageStatsControllerTest extends TestCase
{
    private UsageStatsController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->controller = new UsageStatsController();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_get_consent_defaults_to_enabled(): void
    {
        Functions\when('get_option')->alias(static fn(string $name, mixed $fallback = false): mixed => $fallback);

        $this->assertSame(['enabled' => true], $this->controller->get_consent()->get_data());
    }

    public function test_get_consent_reports_an_opt_out(): void
    {
        Functions\when('get_option')->justReturn(false);

        $this->assertSame(['enabled' => false], $this->controller->get_consent()->get_data());
    }

    public function test_update_consent_persists_and_echoes_the_new_value(): void
    {
        Functions\expect('update_option')->once()->with(UsageStats::OPTION, 0)->andReturn(true);
        Functions\when('get_option')->justReturn(0);

        $response = $this->controller->update_consent(new WP_REST_Request(['enabled' => false]));

        $this->assertSame(['enabled' => false], $response->get_data());
        $this->assertSame(200, $response->status);
    }

    public function test_update_consent_fails_when_the_opt_out_did_not_persist(): void
    {
        Functions\when('update_option')->justReturn(false);
        Functions\when('get_option')->alias(static fn(string $name, mixed $fallback = false): mixed => $fallback);

        $response = $this->controller->update_consent(new WP_REST_Request(['enabled' => false]));

        $this->assertSame(500, $response->status);
    }
}
