<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Snippets\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Exception\NoActiveSnippetPluginException;
use Loopress\Snippets\Exception\SnippetProviderRequestException;
use Loopress\Snippets\Exception\UnsupportedLocationException;
use Loopress\Snippets\RestApi\SnippetController;
use Loopress\Snippets\Service\SnippetService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class SnippetControllerTest extends TestCase
{
    private SnippetService&MockObject $snippetService;
    private SnippetController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->snippetService = $this->createMock(SnippetService::class);
        $this->controller     = new SnippetController($this->snippetService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── get_snippets ─────────────────────────────────────────────────────────

    public function test_get_snippets_returns_409_when_no_snippet_plugin_is_active(): void
    {
        $this->snippetService->method('isActive')->willReturn(false);
        $this->snippetService->expects($this->never())->method('getSnippets');

        $response = $this->controller->get_snippets();

        $this->assertSame(409, $response->status);
    }

    public function test_get_snippets_returns_200_with_the_service_result(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippets')->willReturn([new SnippetData(id: 1)]);

        $response = $this->controller->get_snippets();

        $this->assertSame(200, $response->status);
        $this->assertSame([['id' => 1]], $response->data);
    }

    public function test_get_snippets_returns_409_when_the_service_throws_no_active_snippet_plugin(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippets')->willThrowException(
            new NoActiveSnippetPluginException('Multiple snippet plugins are active at once.'),
        );

        $response = $this->controller->get_snippets();

        $this->assertSame(409, $response->status);
    }

    public function test_get_snippets_returns_502_when_the_service_throws_a_provider_request_failure(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippets')->willThrowException(
            new SnippetProviderRequestException('Code Snippets request failed.'),
        );

        $response = $this->controller->get_snippets();

        $this->assertSame(502, $response->status);
    }

    public function test_get_snippets_returns_500_on_unexpected_runtime_exception(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippets')->willThrowException(new \RuntimeException('Unexpected.'));

        $response = $this->controller->get_snippets();

        $this->assertSame(500, $response->status);
    }

    // ── get_snippet ──────────────────────────────────────────────────────────

    public function test_get_snippet_returns_409_when_no_snippet_plugin_is_active(): void
    {
        $this->snippetService->method('isActive')->willReturn(false);

        $response = $this->controller->get_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(409, $response->status);
    }

    public function test_get_snippet_returns_404_when_not_found(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippet')->willReturn(null);

        $response = $this->controller->get_snippet(new WP_REST_Request(['id' => '999']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_snippet_returns_200_with_the_snippet(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippet')->with(1)->willReturn(new SnippetData(id: 1));

        $response = $this->controller->get_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['id' => 1], $response->data);
    }

    public function test_get_snippet_returns_409_when_the_service_throws_no_active_snippet_plugin(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippet')->willThrowException(
            new NoActiveSnippetPluginException('Multiple snippet plugins are active at once.'),
        );

        $response = $this->controller->get_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(409, $response->status);
    }

    public function test_get_snippet_returns_502_when_the_service_throws_a_provider_request_failure(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippet')->willThrowException(
            new SnippetProviderRequestException('Code Snippets request failed.'),
        );

        $response = $this->controller->get_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(502, $response->status);
    }

    // ── create_snippet ───────────────────────────────────────────────────────

    public function test_create_snippet_returns_409_when_no_snippet_plugin_is_active(): void
    {
        $this->snippetService->method('isActive')->willReturn(false);
        $this->snippetService->expects($this->never())->method('createSnippet');

        $response = $this->controller->create_snippet(new WP_REST_Request(['name' => 'Test', 'code' => '<?php']));

        $this->assertSame(409, $response->status);
    }

    public function test_create_snippet_returns_201_with_the_created_snippet(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('createSnippet')->willReturn(new SnippetData(id: 1, name: 'Test'));

        $response = $this->controller->create_snippet(new WP_REST_Request(['name' => 'Test', 'code' => '<?php']));

        $this->assertSame(201, $response->status);
        $this->assertSame(['id' => 1, 'name' => 'Test'], $response->data);
    }

    public function test_create_snippet_forwards_every_request_field_to_the_service(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);

        $received = null;
        $this->snippetService->method('createSnippet')->willReturnCallback(
            function (SnippetData $data) use (&$received): SnippetData {
                $received = $data;

                return new SnippetData(id: 99);
            },
        );

        $this->controller->create_snippet(new WP_REST_Request([
            'name'                => 'Analytics',
            'code'                => '<script></script>',
            'type'                => 'js',
            'active'              => true,
            'description'         => 'GA snippet',
            'tags'                => ['analytics', 'head'],
            'location'            => 'header',
            'insertMethod'        => 'shortcode',
            'priority'            => 3,
            'shortcodeAttributes' => ['id'],
        ]));

        $this->assertEquals(SnippetData::fromArray([
            'name'                => 'Analytics',
            'code'                => '<script></script>',
            'type'                => 'js',
            'active'              => true,
            'description'         => 'GA snippet',
            'tags'                => ['analytics', 'head'],
            'location'            => 'header',
            'insertMethod'        => 'shortcode',
            'priority'            => 3,
            'shortcodeAttributes' => ['id'],
        ]), $received);
    }

    public function test_update_snippet_forwards_only_the_provided_fields_and_the_route_id(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);

        $received = null;
        $receivedId = null;
        $this->snippetService->method('updateSnippet')->willReturnCallback(
            function (int $id, SnippetData $data) use (&$received, &$receivedId): SnippetData {
                $receivedId = $id;
                $received   = $data;

                return new SnippetData(id: $id);
            },
        );

        // Only description and priority are sent; every other field is absent and must not
        // be forwarded as a null "clear this" instruction.
        $this->controller->update_snippet(new WP_REST_Request([
            'id'          => '5',
            'description' => 'Updated note',
            'priority'    => 7,
        ]));

        $this->assertSame(5, $receivedId);
        $this->assertEquals(
            SnippetData::fromArray(['description' => 'Updated note', 'priority' => 7]),
            $received,
        );
    }

    public function test_create_snippet_returns_400_when_the_service_throws_unsupported_location(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('createSnippet')->willThrowException(
            new UnsupportedLocationException('WPCode does not support the "admin" location for css snippets.'),
        );

        $response = $this->controller->create_snippet(new WP_REST_Request(['name' => 'Test', 'code' => 'x']));

        $this->assertSame(400, $response->status);
    }

    public function test_create_snippet_returns_409_when_the_service_throws_no_active_snippet_plugin(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('createSnippet')->willThrowException(
            new NoActiveSnippetPluginException('Multiple snippet plugins are active at once.'),
        );

        $response = $this->controller->create_snippet(new WP_REST_Request(['name' => 'Test', 'code' => 'x']));

        $this->assertSame(409, $response->status);
    }

    public function test_create_snippet_returns_502_when_the_service_throws_a_provider_request_failure(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('createSnippet')->willThrowException(
            new SnippetProviderRequestException('Failed to create snippet.'),
        );

        $response = $this->controller->create_snippet(new WP_REST_Request(['name' => 'Test', 'code' => 'x']));

        $this->assertSame(502, $response->status);
    }

    public function test_create_snippet_returns_500_on_unexpected_runtime_exception(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('createSnippet')->willThrowException(new \RuntimeException('Unexpected.'));

        $response = $this->controller->create_snippet(new WP_REST_Request(['name' => 'Test', 'code' => 'x']));

        $this->assertSame(500, $response->status);
    }

    // ── update_snippet ───────────────────────────────────────────────────────

    public function test_update_snippet_returns_409_when_no_snippet_plugin_is_active(): void
    {
        $this->snippetService->method('isActive')->willReturn(false);
        $this->snippetService->expects($this->never())->method('updateSnippet');

        $response = $this->controller->update_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(409, $response->status);
    }

    public function test_update_snippet_returns_404_when_not_found(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('updateSnippet')->willReturn(null);

        $response = $this->controller->update_snippet(new WP_REST_Request(['id' => '999', 'name' => 'New']));

        $this->assertSame(404, $response->status);
    }

    public function test_update_snippet_returns_200_with_the_updated_snippet(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('updateSnippet')->willReturn(new SnippetData(id: 1, name: 'New'));

        $response = $this->controller->update_snippet(new WP_REST_Request(['id' => '1', 'name' => 'New']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['id' => 1, 'name' => 'New'], $response->data);
    }

    public function test_update_snippet_returns_400_when_the_service_throws_unsupported_location(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('updateSnippet')->willThrowException(
            new UnsupportedLocationException('WPCode does not support the "admin" location for css snippets.'),
        );

        $response = $this->controller->update_snippet(new WP_REST_Request(['id' => '1', 'location' => 'admin']));

        $this->assertSame(400, $response->status);
    }

    public function test_update_snippet_returns_409_when_the_service_throws_no_active_snippet_plugin(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('updateSnippet')->willThrowException(
            new NoActiveSnippetPluginException('Multiple snippet plugins are active at once.'),
        );

        $response = $this->controller->update_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(409, $response->status);
    }

    public function test_update_snippet_returns_502_when_the_service_throws_a_provider_request_failure(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('updateSnippet')->willThrowException(
            new SnippetProviderRequestException('Failed to update snippet.'),
        );

        $response = $this->controller->update_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(502, $response->status);
    }

    public function test_update_snippet_returns_500_on_unexpected_runtime_exception(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('updateSnippet')->willThrowException(new \RuntimeException('Unexpected.'));

        $response = $this->controller->update_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(500, $response->status);
    }

    // ── delete_snippet ───────────────────────────────────────────────────────

    public function test_delete_snippet_returns_409_when_no_snippet_plugin_is_active(): void
    {
        $this->snippetService->method('isActive')->willReturn(false);
        $this->snippetService->expects($this->never())->method('deleteSnippet');

        $response = $this->controller->delete_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(409, $response->status);
    }

    public function test_delete_snippet_returns_404_when_not_found(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('deleteSnippet')->willReturn(false);

        $response = $this->controller->delete_snippet(new WP_REST_Request(['id' => '999']));

        $this->assertSame(404, $response->status);
    }

    public function test_delete_snippet_returns_204_on_success(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('deleteSnippet')->willReturn(true);

        $response = $this->controller->delete_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(204, $response->status);
    }

    public function test_delete_snippet_returns_409_when_the_service_throws_no_active_snippet_plugin(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('deleteSnippet')->willThrowException(
            new NoActiveSnippetPluginException('Multiple snippet plugins are active at once.'),
        );

        $response = $this->controller->delete_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(409, $response->status);
    }

    public function test_delete_snippet_returns_500_on_unexpected_runtime_exception(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('deleteSnippet')->willThrowException(new \RuntimeException('Unexpected.'));

        $response = $this->controller->delete_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertSame(500, $response->status);
    }

    // ── register_routes ─────────────────────────────────────────────────────

    /**
     * @return array<int, array{namespace: string, route: string, args: array<mixed>}>
     */
    private function capturedRoutes(): array
    {
        $routes = [];
        Functions\when('register_rest_route')->alias(
            static function (string $restNamespace, string $route, array $args) use (&$routes): bool {
                $routes[] = ['namespace' => $restNamespace, 'route' => $route, 'args' => $args];

                return true;
            },
        );

        $this->controller->register_routes();

        return $routes;
    }

    public function test_register_routes_registers_the_collection_and_item_routes_under_the_loopress_namespace(): void
    {
        $routes = $this->capturedRoutes();

        $this->assertCount(2, $routes);
        $this->assertSame(['loopress/v1', 'loopress/v1'], array_column($routes, 'namespace'));
        $this->assertSame(['/snippets', '/snippets/(?P<id>\d+)'], array_column($routes, 'route'));
    }

    public function test_register_routes_wires_every_verb_to_its_handler(): void
    {
        [$collection, $item] = $this->capturedRoutes();

        $this->assertSame(
            [['GET', 'get_snippets'], ['POST', 'create_snippet']],
            array_map(fn(array $e): array => [$e['methods'], $e['callback'][1]], $collection['args']),
        );
        $this->assertSame(
            [['GET', 'get_snippet'], ['PUT', 'update_snippet'], ['DELETE', 'delete_snippet']],
            array_map(fn(array $e): array => [$e['methods'], $e['callback'][1]], $item['args']),
        );

        foreach ([$collection, $item] as $route) {
            foreach ($route['args'] as $endpoint) {
                $this->assertSame($this->controller, $endpoint['callback'][0]);
                $this->assertIsCallable($endpoint['permission_callback']);
            }
        }
    }

    // The POST body schema is the public contract for creating a snippet: required flags,
    // defaults and enums are all asserted field by field so a drift in any one of them
    // (a dropped default, a widened enum, a field made required) is caught here.
    public function test_register_routes_declares_the_full_create_body_schema(): void
    {
        [$collection] = $this->capturedRoutes();

        $this->assertSame([
            'name'                => ['required' => true,  'type' => 'string'],
            'code'                => ['required' => true,  'type' => 'string'],
            'type'                => ['required' => false, 'type' => 'string', 'default' => 'php', 'enum' => ['php', 'js', 'css', 'html', 'text']],
            'active'              => ['required' => false, 'type' => 'boolean', 'default' => false],
            'description'         => ['required' => false, 'type' => 'string',  'default' => ''],
            'tags'                => ['required' => false, 'type' => 'array',   'default' => [], 'items' => ['type' => 'string']],
            'location'            => ['required' => false, 'type' => 'string', 'enum' => ['admin', 'body', 'everywhere', 'footer', 'frontend', 'header', 'once']],
            'insertMethod'        => ['required' => false, 'type' => 'string', 'default' => 'auto', 'enum' => ['auto', 'shortcode']],
            'priority'            => ['required' => false, 'type' => 'integer', 'default' => 10],
            'shortcodeAttributes' => ['required' => false, 'type' => 'array', 'default' => [], 'items' => ['type' => 'string']],
        ], $collection['args'][1]['args']);
    }

    public function test_register_routes_constrains_the_item_id_to_digits_and_a_positive_value(): void
    {
        [, $item] = $this->capturedRoutes();

        foreach ([$item['args'][0]['args'], $item['args'][1]['args'], $item['args'][2]['args']] as $args) {
            $idArg = $args['id'];
            $this->assertTrue($idArg['required']);
            $this->assertSame('absint', $idArg['sanitize_callback']);
            $this->assertTrue($idArg['validate_callback']('7'));
            $this->assertFalse($idArg['validate_callback']('0'));
            $this->assertFalse($idArg['validate_callback']('-3'));
            $this->assertFalse($idArg['validate_callback']('abc'));
        }
    }

    // Update takes the same fields as create but every one optional and with no defaults:
    // a null field on PUT means "leave unchanged", so a leaked default would overwrite.
    public function test_register_routes_declares_the_full_update_body_schema(): void
    {
        [, $item] = $this->capturedRoutes();
        $update = $item['args'][1]['args'];

        $this->assertArrayHasKey('id', $update);
        unset($update['id']);

        $this->assertSame([
            'name'                => ['required' => false, 'type' => 'string'],
            'code'                => ['required' => false, 'type' => 'string'],
            'type'                => ['required' => false, 'type' => 'string', 'enum' => ['php', 'js', 'css', 'html', 'text']],
            'active'              => ['required' => false, 'type' => 'boolean'],
            'description'         => ['required' => false, 'type' => 'string'],
            'tags'                => ['required' => false, 'type' => 'array', 'items' => ['type' => 'string']],
            'location'            => ['required' => false, 'type' => 'string', 'enum' => ['admin', 'body', 'everywhere', 'footer', 'frontend', 'header', 'once']],
            'insertMethod'        => ['required' => false, 'type' => 'string', 'enum' => ['auto', 'shortcode']],
            'priority'            => ['required' => false, 'type' => 'integer'],
            'shortcodeAttributes' => ['required' => false, 'type' => 'array', 'items' => ['type' => 'string']],
        ], $update);
    }

    public function test_register_routes_guards_every_endpoint_with_the_manage_options_permission(): void
    {
        Functions\expect('current_user_can')->with('manage_options')->andReturn(false, true);

        [$collection, $item] = $this->capturedRoutes();

        $callbacks = [];
        foreach ([$collection, $item] as $route) {
            foreach ($route['args'] as $endpoint) {
                $callbacks[] = $endpoint['permission_callback'];
            }
        }
        $this->assertCount(5, $callbacks);
        $this->assertFalse($callbacks[0]());
        $this->assertTrue($callbacks[1]());
    }
}
