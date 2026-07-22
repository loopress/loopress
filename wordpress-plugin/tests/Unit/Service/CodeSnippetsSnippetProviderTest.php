<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Snippets\Service\CodeSnippetsSnippetProvider;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;
use WP_REST_Response;

class CodeSnippetsSnippetProviderTest extends TestCase
{
    private CodeSnippetsSnippetProvider $provider;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->provider = new CodeSnippetsSnippetProvider();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_is_not_active_when_code_snippets_plugin_class_is_missing(): void
    {
        $this->assertFalse($this->provider->isActive());
    }

    // ── getSnippets ───────────────────────────────────────────────────────────

    public function test_get_snippets_dispatches_a_get_request_and_normalizes_the_list(): void
    {
        Functions\when('rest_do_request')->alias(function (WP_REST_Request $request) {
            $this->assertSame('/code-snippets/v1/snippets', $request->get_route());

            return new WP_REST_Response([
                ['active' => true, 'code' => 'echo 1;', 'desc' => 'A snippet', 'id' => 1, 'name' => 'One', 'priority' => 5, 'scope' => 'global', 'tags' => ['php']],
            ], 200);
        });
        Functions\when('Code_Snippets\get_snippets')->justReturn([]);

        $result = $this->provider->getSnippets();

        $this->assertCount(1, $result);
        $this->assertSame(1, $result[0]['id']);
        $this->assertSame('One', $result[0]['name']);
        $this->assertSame('A snippet', $result[0]['description']);
        $this->assertSame('php', $result[0]['type']);
        $this->assertSame('everywhere', $result[0]['location']);
        $this->assertSame(5, $result[0]['priority']);
        $this->assertSame(['php'], $result[0]['tags']);
    }

    public function test_get_snippets_excludes_trashed_snippets(): void
    {
        Functions\when('rest_do_request')->alias(fn() => new WP_REST_Response([
            ['active' => false, 'code' => '', 'desc' => '', 'id' => 1, 'name' => 'Kept', 'scope' => 'global', 'tags' => []],
            ['active' => false, 'code' => '', 'desc' => '', 'id' => 2, 'name' => 'Trashed', 'scope' => 'global', 'tags' => []],
        ], 200));
        Functions\when('Code_Snippets\get_snippets')->alias(function (array $ids) {
            $this->assertSame([1, 2], $ids);

            return [
                $this->fakeSnippet(1, false),
                $this->fakeSnippet(2, true),
            ];
        });

        $result = $this->provider->getSnippets();

        $this->assertCount(1, $result);
        $this->assertSame(1, $result[0]['id']);
    }

    // ── getSnippet ────────────────────────────────────────────────────────────

    public function test_get_snippet_dispatches_a_get_request_for_the_given_id(): void
    {
        Functions\when('Code_Snippets\get_snippet')->justReturn($this->fakeSnippet(7, false));
        Functions\when('rest_do_request')->alias(function (WP_REST_Request $request) {
            $this->assertSame('/code-snippets/v1/snippets/7', $request->get_route());

            return new WP_REST_Response(['active' => false, 'code' => '', 'id' => 7, 'name' => 'Seven', 'scope' => 'admin-css'], 200);
        });

        $result = $this->provider->getSnippet(7);

        $this->assertSame(7, $result['id']);
        $this->assertSame('css', $result['type']);
        $this->assertSame('admin', $result['location']);
    }

    public function test_get_snippet_returns_null_when_the_request_errors(): void
    {
        Functions\when('Code_Snippets\get_snippet')->justReturn($this->fakeSnippet(999, false));
        Functions\when('rest_do_request')->justReturn(new WP_REST_Response(new \WP_Error('not_found', 'Snippet not found.'), 404));

        $this->assertNull($this->provider->getSnippet(999));
    }

    public function test_get_snippet_returns_null_when_the_snippet_is_trashed(): void
    {
        Functions\when('Code_Snippets\get_snippet')->justReturn($this->fakeSnippet(999, true));
        // If this reaches rest_do_request at all, the trash check didn't short-circuit.
        Functions\when('rest_do_request')->alias(function () {
            $this->fail('rest_do_request should not be called for a trashed snippet.');
        });

        $this->assertNull($this->provider->getSnippet(999));
    }

    private function fakeSnippet(int $id, bool $trashed): object
    {
        return new class($id, $trashed) {
            public function __construct(public readonly int $id, private readonly bool $trashed) {}

            public function is_trashed(): bool
            {
                return $this->trashed;
            }
        };
    }

    // ── createSnippet ─────────────────────────────────────────────────────────

    public function test_create_snippet_sends_the_translated_payload_and_normalizes_the_response(): void
    {
        Functions\when('rest_do_request')->alias(function (WP_REST_Request $request) {
            $this->assertSame('/code-snippets/v1/snippets', $request->get_route());
            $this->assertSame('New', $request->get_param('name'));
            $this->assertSame('A description', $request->get_param('desc'));
            $this->assertSame('front-end', $request->get_param('scope'));

            return new WP_REST_Response(['active' => true, 'code' => 'echo 1;', 'desc' => 'A description', 'id' => 10, 'name' => 'New', 'scope' => 'front-end'], 201);
        });

        $result = $this->provider->createSnippet([
            'active'      => true,
            'code'        => 'echo 1;',
            'description' => 'A description',
            'location'    => 'frontend',
            'name'        => 'New',
            'type'        => 'php',
        ]);

        $this->assertSame(10, $result['id']);
        $this->assertSame('frontend', $result['location']);
    }

    public function test_create_snippet_throws_for_unsupported_type_location_combination(): void
    {
        $this->expectException(\RuntimeException::class);

        $this->provider->createSnippet(['location' => 'body', 'name' => 'x', 'type' => 'css']);
    }

    public function test_create_snippet_throws_for_text_type(): void
    {
        $this->expectException(\RuntimeException::class);

        $this->provider->createSnippet(['location' => 'everywhere', 'name' => 'x', 'type' => 'text']);
    }

    // ── updateSnippet ─────────────────────────────────────────────────────────

    public function test_update_snippet_dispatches_a_put_request(): void
    {
        Functions\when('rest_do_request')->alias(function (WP_REST_Request $request) {
            $this->assertSame('/code-snippets/v1/snippets/3', $request->get_route());
            $this->assertSame('Updated', $request->get_param('name'));

            return new WP_REST_Response(['active' => true, 'code' => '', 'id' => 3, 'name' => 'Updated', 'scope' => 'global'], 200);
        });

        $result = $this->provider->updateSnippet(3, ['name' => 'Updated']);

        $this->assertSame('Updated', $result['name']);
    }

    public function test_update_snippet_returns_null_when_the_request_errors(): void
    {
        Functions\when('rest_do_request')->justReturn(new WP_REST_Response(new \WP_Error('not_found', 'Snippet not found.'), 404));

        $this->assertNull($this->provider->updateSnippet(999, ['name' => 'x']));
    }

    // ── deleteSnippet ─────────────────────────────────────────────────────────

    public function test_delete_snippet_dispatches_a_delete_request(): void
    {
        Functions\when('rest_do_request')->alias(function (WP_REST_Request $request) {
            $this->assertSame('DELETE', $request->get_method());
            $this->assertSame('/code-snippets/v1/snippets/4', $request->get_route());

            return new WP_REST_Response(null, 200);
        });

        $this->assertTrue($this->provider->deleteSnippet(4));
    }

    public function test_delete_snippet_returns_false_when_the_request_errors(): void
    {
        Functions\when('rest_do_request')->justReturn(new WP_REST_Response(new \WP_Error('not_found', 'Snippet not found.'), 404));

        $this->assertFalse($this->provider->deleteSnippet(999));
    }
}
