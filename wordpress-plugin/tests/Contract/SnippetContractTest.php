<?php

declare(strict_types=1);

namespace Loopress\Tests\Contract;

use Brain\Monkey;
use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Contract\SnippetType;
use Loopress\Snippets\RestApi\SnippetController;
use Loopress\Snippets\Service\SnippetService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class SnippetContractTest extends TestCase
{
    use AssertsJsonSchema;

    private SnippetService&MockObject $snippetService;
    private SnippetController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->snippetService = $this->createMock(SnippetService::class);
        $this->controller      = new SnippetController($this->snippetService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private function fakeSnippet(): SnippetData
    {
        return new SnippetData(
            id: 1,
            name: 'Tracking script',
            code: '<script></script>',
            type: SnippetType::Js,
            active: true,
            description: 'Analytics',
            tags: ['analytics'],
            location: 'footer',
            insertMethod: 'auto',
            priority: 10,
            shortcodeAttributes: [],
        );
    }

    public function test_get_snippets_response_matches_schema(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippets')->willReturn([$this->fakeSnippet()]);

        $response = $this->controller->get_snippets();

        $this->assertMatchesSchema('snippet-list.schema.json', $response->data);
    }

    public function test_get_snippet_response_matches_schema(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('getSnippet')->willReturn($this->fakeSnippet());

        $response = $this->controller->get_snippet(new WP_REST_Request(['id' => '1']));

        $this->assertMatchesSchema('snippet.schema.json', $response->data);
    }

    public function test_create_snippet_response_matches_schema(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('createSnippet')->willReturn($this->fakeSnippet());

        $request  = new WP_REST_Request(['name' => 'Tracking script', 'code' => '<script></script>']);
        $response = $this->controller->create_snippet($request);

        $this->assertMatchesSchema('snippet.schema.json', $response->data);
    }

    public function test_update_snippet_response_matches_schema(): void
    {
        $this->snippetService->method('isActive')->willReturn(true);
        $this->snippetService->method('updateSnippet')->willReturn($this->fakeSnippet());

        $response = $this->controller->update_snippet(new WP_REST_Request(['id' => '1', 'name' => 'Updated']));

        $this->assertMatchesSchema('snippet.schema.json', $response->data);
    }

    // delete_snippet returns 204 with a null body: no JSON shape to validate against a schema.
}
