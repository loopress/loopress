<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

use Brain\Monkey;
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
}
