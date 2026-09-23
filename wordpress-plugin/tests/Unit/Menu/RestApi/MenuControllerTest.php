<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Menu\RestApi;

use Brain\Monkey;
use Loopress\Menu\Exception\StaleMenuRevisionException;
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
        $this->menuService->method('listMenus')
            ->willReturn([['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-1', 'warnings' => []]]);

        $response = $this->controller->list_menus();

        $this->assertSame(200, $response->status);
        $this->assertSame([['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-1', 'warnings' => []]], $response->data);
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
        $this->menuService->method('getMenu')->with('main')
            ->willReturn(['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-1', 'warnings' => []]);

        $response = $this->controller->get_menu(new WP_REST_Request(['slug' => 'main']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-1', 'warnings' => []], $response->data);
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
            ->with('main', 'Main', [['type' => 'custom', 'url' => '/x']], null)
            ->willReturn(['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-1', 'warnings' => []]);

        $response = $this->controller->upsert_menu(new WP_REST_Request([
            'items' => [['type' => 'custom', 'url' => '/x']],
            'name'  => 'Main',
            'slug'  => 'main',
        ]));

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-1', 'warnings' => []], $response->data);
    }

    public function test_upsert_menu_defaults_items_to_an_empty_array(): void
    {
        $this->menuService->expects($this->once())
            ->method('upsertMenu')
            ->with('main', 'Main', [], null)
            ->willReturn(['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-1', 'warnings' => []]);

        $this->controller->upsert_menu(new WP_REST_Request(['name' => 'Main', 'slug' => 'main']));
    }

    // A malformed (non-array) "items" must be rejected, not silently coerced to [], which would
    // otherwise wipe the target menu's items on push.
    public function test_upsert_menu_returns_400_when_items_is_not_an_array(): void
    {
        $this->menuService->expects($this->never())->method('upsertMenu');

        $response = $this->controller->upsert_menu(new WP_REST_Request(['items' => 'not-an-array', 'name' => 'Main', 'slug' => 'main']));

        $this->assertSame(400, $response->status);
    }

    // ── upsert: conditional write (#234) ────────────────────────────────────

    public function test_upsert_menu_forwards_expected_revision_from_the_request_body(): void
    {
        $this->menuService->expects($this->once())
            ->method('upsertMenu')
            ->with('main', 'Main', [], 'rev-1')
            ->willReturn(['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-2', 'warnings' => []]);

        $response = $this->controller->upsert_menu(new WP_REST_Request([
            'expectedRevision' => 'rev-1',
            'name'             => 'Main',
            'slug'             => 'main',
        ]));

        $this->assertSame(200, $response->status);
    }

    public function test_upsert_menu_passes_null_when_no_expected_revision_is_given(): void
    {
        $this->menuService->expects($this->once())
            ->method('upsertMenu')
            ->with('main', 'Main', [], null)
            ->willReturn(['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-1', 'warnings' => []]);

        $this->controller->upsert_menu(new WP_REST_Request(['name' => 'Main', 'slug' => 'main']));
        $this->addToAssertionCount(1);
    }

    public function test_upsert_menu_passes_null_when_expected_revision_is_explicitly_null(): void
    {
        $this->menuService->expects($this->once())
            ->method('upsertMenu')
            ->with('main', 'Main', [], null)
            ->willReturn(['slug' => 'main', 'name' => 'Main', 'items' => [], 'revision' => 'rev-1', 'warnings' => []]);

        $this->controller->upsert_menu(new WP_REST_Request(['expectedRevision' => null, 'name' => 'Main', 'slug' => 'main']));
        $this->addToAssertionCount(1);
    }

    // Regression coverage (#234): a malformed expectedRevision must be rejected, never silently
    // dropped, a client that (accidentally or otherwise) sent something other than a string would
    // otherwise have the conditional-write precondition disabled entirely instead of getting a
    // clear error, and upsertMenu() would run as if no precondition had been requested.
    public function test_upsert_menu_returns_400_when_expected_revision_is_not_a_string(): void
    {
        $this->menuService->expects($this->never())->method('upsertMenu');

        $response = $this->controller->upsert_menu(new WP_REST_Request([
            'expectedRevision' => 12_345,
            'name'             => 'Main',
            'slug'             => 'main',
        ]));

        $this->assertSame(400, $response->status);
    }

    public function test_upsert_menu_returns_412_when_the_expected_revision_is_stale(): void
    {
        $this->menuService->method('upsertMenu')->willThrowException(
            new StaleMenuRevisionException('"main" changed on WordPress since it was last read.'),
        );

        $response = $this->controller->upsert_menu(new WP_REST_Request([
            'expectedRevision' => 'stale-revision',
            'name'             => 'Main',
            'slug'             => 'main',
        ]));

        $this->assertSame(412, $response->status);
        $this->assertSame(['error' => '"main" changed on WordPress since it was last read.'], $response->data);
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
