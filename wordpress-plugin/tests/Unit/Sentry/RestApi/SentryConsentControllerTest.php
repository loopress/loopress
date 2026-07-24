<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Sentry\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Sentry\Consent;
use Loopress\Sentry\RestApi\SentryConsentController;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class SentryConsentControllerTest extends TestCase
{
    private SentryConsentController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->controller = new SentryConsentController();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_get_consent_reports_null_when_never_decided(): void
    {
        Functions\when('get_option')->justReturn(null);

        $response = $this->controller->get_consent();

        $this->assertSame(['enabled' => null], $response->get_data());
        $this->assertSame(200, $response->status);
    }

    public function test_get_consent_reports_an_explicit_decision(): void
    {
        Functions\when('get_option')->justReturn(false);

        $response = $this->controller->get_consent();

        $this->assertSame(['enabled' => false], $response->get_data());
        $this->assertSame(200, $response->status);
    }

    public function test_update_consent_persists_and_echoes_the_new_value(): void
    {
        Functions\expect('update_option')->once()->with(Consent::OPTION, true)->andReturn(true);

        $request = new WP_REST_Request(['enabled' => true]);
        $response = $this->controller->update_consent($request);

        $this->assertSame(['enabled' => true], $response->get_data());
        $this->assertSame(200, $response->status);
    }
}
