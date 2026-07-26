<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Api\ApiNamespace;
use Loopress\Api\RestApi\ApiNamespaceController;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class ApiNamespaceControllerTest extends TestCase
{
    private ApiNamespaceController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->controller = new ApiNamespaceController();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_get_namespace_reports_the_default_when_never_configured(): void
    {
        Functions\when('get_option')->justReturn(ApiNamespace::DEFAULT);

        $response = $this->controller->get_namespace();

        $this->assertSame(['namespace' => ApiNamespace::DEFAULT], $response->get_data());
        $this->assertSame(200, $response->status);
    }

    public function test_update_namespace_persists_and_echoes_the_new_value(): void
    {
        Functions\expect('update_option')->once()->with(ApiNamespace::OPTION, 'my-headless-api/v1')->andReturn(true);

        $request  = new WP_REST_Request(['namespace' => 'my-headless-api/v1']);
        $response = $this->controller->update_namespace($request);

        $this->assertSame(['namespace' => 'my-headless-api/v1'], $response->get_data());
        $this->assertSame(200, $response->status);
    }
}
