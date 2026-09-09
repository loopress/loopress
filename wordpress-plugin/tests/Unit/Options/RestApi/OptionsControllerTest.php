<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Options\RestApi;

use Brain\Monkey;
use Loopress\Options\Exception\ReservedOptionNameException;
use Loopress\Options\RestApi\OptionsController;
use Loopress\Options\Service\OptionsService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class OptionsControllerTest extends TestCase
{
    private OptionsController $controller;
    private OptionsService&MockObject $optionsService;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->optionsService = $this->createMock(OptionsService::class);
        $this->controller     = new OptionsController($this->optionsService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── list ─────────────────────────────────────────────────────────────────

    public function test_list_options_returns_the_service_result(): void
    {
        $this->optionsService->method('listOptionNames')->willReturn([['name' => 'blogname', 'autoload' => 'yes']]);

        $response = $this->controller->list_options(new WP_REST_Request());

        $this->assertSame(200, $response->status);
        $this->assertSame([['name' => 'blogname', 'autoload' => 'yes']], $response->data);
    }

    // ── get ──────────────────────────────────────────────────────────────────

    public function test_get_option_returns_404_when_not_found(): void
    {
        $this->optionsService->method('getOption')->willReturn(null);

        $response = $this->controller->get_option(new WP_REST_Request(['name' => 'missing']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_option_returns_200_with_the_option(): void
    {
        $this->optionsService->method('getOption')->with('blogname')->willReturn(['name' => 'blogname', 'value' => 'Hello', 'autoload' => 'yes']);

        $response = $this->controller->get_option(new WP_REST_Request(['name' => 'blogname']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['name' => 'blogname', 'value' => 'Hello', 'autoload' => 'yes'], $response->data);
    }

    // ── update ───────────────────────────────────────────────────────────────

    public function test_update_option_returns_400_when_the_body_has_no_value(): void
    {
        $this->optionsService->expects($this->never())->method('updateOption');

        $response = $this->controller->update_option(new WP_REST_Request(['name' => 'blogname']));

        $this->assertSame(400, $response->status);
    }

    // Regression coverage: get_json_params() returns whatever json_decode() produced for the raw
    // request body, a bare `null` included (an empty body, or a literal "null" body); this must
    // still resolve to the same clean 400, not an uncaught TypeError from array_key_exists().
    public function test_update_option_returns_400_when_the_json_body_is_null(): void
    {
        $this->optionsService->expects($this->never())->method('updateOption');

        $request = new WP_REST_Request(['name' => 'blogname']);
        $request->set_json_params(null);

        $response = $this->controller->update_option($request);

        $this->assertSame(400, $response->status);
    }

    public function test_update_option_returns_200_with_the_updated_option(): void
    {
        $this->optionsService->expects($this->once())
            ->method('updateOption')
            ->with('blogname', 'Hello', 'yes')
            ->willReturn(['name' => 'blogname', 'value' => 'Hello', 'autoload' => 'yes']);

        $response = $this->controller->update_option(new WP_REST_Request([
            'name'     => 'blogname',
            'value'    => 'Hello',
            'autoload' => 'yes',
        ]));

        $this->assertSame(200, $response->status);
        $this->assertSame(['name' => 'blogname', 'value' => 'Hello', 'autoload' => 'yes'], $response->data);
    }

    // Regression coverage: a name already owned by `plugin`/`theme` must surface as a client-
    // actionable 409, not the generic 500 the catch-all would otherwise assign.
    public function test_update_option_returns_409_for_a_reserved_name(): void
    {
        $this->optionsService->method('updateOption')->willThrowException(
            new ReservedOptionNameException('"active_plugins" is managed by another Loopress resource.'),
        );

        $response = $this->controller->update_option(new WP_REST_Request(['name' => 'active_plugins', 'value' => []]));

        $this->assertSame(409, $response->status);
    }

    // ── delete ───────────────────────────────────────────────────────────────

    public function test_delete_option_returns_404_when_not_found(): void
    {
        $this->optionsService->method('getOption')->willReturn(null);
        $this->optionsService->expects($this->never())->method('deleteOption');

        $response = $this->controller->delete_option(new WP_REST_Request(['name' => 'missing']));

        $this->assertSame(404, $response->status);
    }

    public function test_delete_option_returns_200_when_deleted(): void
    {
        $this->optionsService->method('getOption')->willReturn(['name' => 'my_option', 'value' => 1, 'autoload' => 'yes']);
        $this->optionsService->expects($this->once())->method('deleteOption')->with('my_option');

        $response = $this->controller->delete_option(new WP_REST_Request(['name' => 'my_option']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['name' => 'my_option', 'deleted' => true], $response->data);
    }

    public function test_delete_option_returns_409_for_a_reserved_name(): void
    {
        $this->optionsService->method('getOption')->willReturn(['name' => 'template', 'value' => 'x', 'autoload' => 'yes']);
        $this->optionsService->method('deleteOption')->willThrowException(
            new ReservedOptionNameException('"template" is managed by another Loopress resource.'),
        );

        $response = $this->controller->delete_option(new WP_REST_Request(['name' => 'template']));

        $this->assertSame(409, $response->status);
    }
}
