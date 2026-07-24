<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Settings\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Sentry\Consent;
use Loopress\Settings\RestApi\SettingsController;
use PHPUnit\Framework\TestCase;

class SettingsControllerTest extends TestCase
{
    private SettingsController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->controller = new SettingsController();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_reset_deletes_every_known_loopress_option(): void
    {
        Functions\expect('delete_option')->once()->with(Consent::OPTION)->andReturn(true);

        $response = $this->controller->reset();

        $this->assertSame(['reset' => true], $response->get_data());
        $this->assertSame(200, $response->status);
    }
}
