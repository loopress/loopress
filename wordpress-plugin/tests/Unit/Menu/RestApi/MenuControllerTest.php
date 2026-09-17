<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Menu\RestApi;

use Brain\Monkey;
use Loopress\Menu\RestApi\MenuController;
use Loopress\Menu\Service\MenuService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class MenuControllerTest extends TestCase
{
    private MenuController $controller;
    private MenuService&MockObject $menuService;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->menuService = $this->createMock(MenuService::class);
        $this->controller  = new MenuController($this->menuService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── menus ───────────────────────────────────────────────────────────────

    public function test_list_menus_returns_the_service_result(): void
    {
        $this->menuService->method('listMenus')->willReturn([['slug' => 'main', 'name' => 'Main', 'items' => [], 'warnings' => []]]);

        $response = $this->controller->list_menus();

        $this->assertSame(200, $response->status);
        $this->assertSame([['slug' => 'main', 'name' => 'Main', 'items' => [], 'warnings' => []]], $response->data);
    }

    public function test_list_menus_returns_500_on_runtime_exception(): void
    {
        $this->menuService->method('listMenus')->willThrowException(new \RuntimeException('boom'));

        $response = $this->controller->list_menus();

        $this->assertSame(500, $response->status);
    }

    public function test_get_menu_returns_404_when_not_found(): void
    {
        $this->menuService->method('getMenu')->willReturn(null);

        $response = $this->controller->get_menu(new WP_REST_Request(['slug' => 'missing']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_menu_returns_200_with_the_menu(): void
    {
        $this->menuService->method('getMenu')->with('main')->willReturn(['slug' => 'main', 'name' => 'Main', 'items' => [], 'warnings' => []]);

        $response = $this->controller->get_menu(new WP_REST_Request(['slug' => 'main']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'main', 'name' => 'Main', 'items' => [], 'warnings' => []], $response->data);
    }

    public function test_upsert_menu_returns_400_when_slug_or_name_is_missing(): void
    {
        $this->menuService->expects($this->never())->method('upsertMenu');

        $response = $this->controller->upsert_menu(new WP_REST_Request(['items' => []]));

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_menu_returns_400_when_the_body_is_not_an_object(): void
    {
        $this->menuService->expects($this->never())->method('upsertMenu');

        $request = new WP_REST_Request([]);
        $request->set_json_params(null);

        $response = $this->controller->upsert_menu($request);

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_menu_returns_500_on_runtime_exception(): void
    {
        $this->menuService->method('upsertMenu')->willThrowException(new \RuntimeException('boom'));

        $response = $this->controller->upsert_menu(new WP_REST_Request(['slug' => 'main', 'name' => 'Main', 'items' => []]));

        $this->assertSame(500, $response->status);
    }

    public function test_upsert_menu_returns_200_with_the_upserted_menu(): void
    {
        $this->menuService->expects($this->once())
            ->method('upsertMenu')
            ->with('main', 'Main', [['type' => 'custom', 'url' => '/x']])
            ->willReturn(['slug' => 'main', 'name' => 'Main', 'items' => [], 'warnings' => []]);

        $response = $this->controller->upsert_menu(new WP_REST_Request([
            'items' => [['type' => 'custom', 'url' => '/x']],
            'name'  => 'Main',
            'slug'  => 'main',
        ]));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'main', 'name' => 'Main', 'items' => [], 'warnings' => []], $response->data);
    }

    public function test_upsert_menu_defaults_items_to_an_empty_array(): void
    {
        $this->menuService->expects($this->once())
            ->method('upsertMenu')
            ->with('main', 'Main', [])
            ->willReturn(['slug' => 'main', 'name' => 'Main', 'items' => [], 'warnings' => []]);

        $this->controller->upsert_menu(new WP_REST_Request(['name' => 'Main', 'slug' => 'main']));
    }

    public function test_delete_menu_returns_404_when_not_found(): void
    {
        $this->menuService->method('deleteMenu')->willReturn(false);

        $response = $this->controller->delete_menu(new WP_REST_Request(['slug' => 'missing']));

        $this->assertSame(404, $response->status);
    }

    public function test_delete_menu_returns_200_when_deleted(): void
    {
        $this->menuService->method('deleteMenu')->with('main')->willReturn(true);

        $response = $this->controller->delete_menu(new WP_REST_Request(['slug' => 'main']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['deleted' => true, 'slug' => 'main'], $response->data);
    }

    // ── locations ───────────────────────────────────────────────────────────

    public function test_get_locations_returns_the_service_result(): void
    {
        $this->menuService->method('getLocations')->willReturn(['primary' => 'main', 'footer' => null]);

        $response = $this->controller->get_locations();

        $this->assertSame(200, $response->status);
        // Cast to an object, not the raw array: an empty map must still encode as JSON `{}`,
        // never `[]`, see MenuController::asJsonObject()'s own docblock.
        $this->assertEquals((object) ['primary' => 'main', 'footer' => null], $response->data);
    }

    public function test_update_locations_returns_400_when_the_body_is_not_an_object(): void
    {
        $this->menuService->expects($this->never())->method('setLocations');

        $request = new WP_REST_Request([]);
        $request->set_json_params(null);

        $response = $this->controller->update_locations($request);

        $this->assertSame(400, $response->status);
    }

    public function test_update_locations_returns_500_on_runtime_exception(): void
    {
        $this->menuService->method('setLocations')->willThrowException(new \RuntimeException('boom'));

        $response = $this->controller->update_locations(new WP_REST_Request(['primary' => 'main']));

        $this->assertSame(500, $response->status);
    }

    public function test_update_locations_returns_200_with_the_updated_mapping(): void
    {
        $this->menuService->expects($this->once())
            ->method('setLocations')
            ->with(['primary' => 'main'])
            ->willReturn(['primary' => 'main', 'footer' => null]);

        $response = $this->controller->update_locations(new WP_REST_Request(['primary' => 'main']));

        $this->assertSame(200, $response->status);
        $this->assertEquals((object) ['primary' => 'main', 'footer' => null], $response->data);
    }
}
