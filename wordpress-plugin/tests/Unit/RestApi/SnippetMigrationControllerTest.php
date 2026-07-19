<?php

namespace Loopress\Tests\Unit\RestApi;

use Brain\Monkey;
use Loopress\RestApi\SnippetMigrationController;
use Loopress\Service\SnippetMigrationService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class SnippetMigrationControllerTest extends TestCase
{
    private SnippetMigrationService&MockObject $wpCodeToCodeSnippets;
    private SnippetMigrationService&MockObject $codeSnippetsToWpCode;
    private SnippetMigrationController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->wpCodeToCodeSnippets = $this->createMock(SnippetMigrationService::class);
        $this->codeSnippetsToWpCode = $this->createMock(SnippetMigrationService::class);
        $this->controller           = new SnippetMigrationController(
            $this->wpCodeToCodeSnippets,
            $this->codeSnippetsToWpCode,
        );
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    /** @return mixed */
    private function invokePrivate(string $method, mixed ...$args): mixed
    {
        $ref = new \ReflectionMethod(SnippetMigrationController::class, $method);
        $ref->setAccessible(true);
        return $ref->invoke($this->controller, ...$args);
    }

    // ── ids arg validation ───────────────────────────────────────────────────

    public function test_ids_arg_is_required(): void
    {
        $arg = $this->invokePrivate('idsArg');
        $this->assertTrue($arg['required']);
    }

    public function test_ids_arg_validate_callback_rejects_empty_array(): void
    {
        $validate = $this->invokePrivate('idsArg')['validate_callback'];
        $this->assertFalse($validate([]));
    }

    public function test_ids_arg_validate_callback_rejects_non_numeric_or_non_positive_ids(): void
    {
        $validate = $this->invokePrivate('idsArg')['validate_callback'];
        $this->assertFalse($validate(['abc']));
        $this->assertFalse($validate([0]));
        $this->assertFalse($validate([-1]));
        $this->assertFalse($validate([1, 'abc']));
    }

    public function test_ids_arg_validate_callback_accepts_a_list_of_positive_ids(): void
    {
        $validate = $this->invokePrivate('idsArg')['validate_callback'];
        $this->assertTrue($validate([1, 2, 3]));
    }

    // ── direction routing ────────────────────────────────────────────────────

    public function test_get_migration_status_uses_the_service_for_the_requested_direction(): void
    {
        $this->wpCodeToCodeSnippets->expects($this->never())->method('sourceActive');
        $this->codeSnippetsToWpCode->method('sourceActive')->willReturn(true);
        $this->codeSnippetsToWpCode->method('destinationActive')->willReturn(true);
        $this->codeSnippetsToWpCode->method('getMigratableSnippets')->willReturn([]);

        $this->controller->get_migration_status(new WP_REST_Request(['direction' => 'code-snippets-to-wpcode']));
    }

    public function test_migrate_uses_the_service_for_the_requested_direction(): void
    {
        $this->codeSnippetsToWpCode->expects($this->never())->method('isReady');
        $this->wpCodeToCodeSnippets->method('isReady')->willReturn(true);
        $this->wpCodeToCodeSnippets->method('migrate')->willReturn([]);

        $this->controller->migrate(new WP_REST_Request(['direction' => 'wpcode-to-code-snippets', 'ids' => [1]]));
    }

    // ── get_migration_status ─────────────────────────────────────────────────

    public function test_get_migration_status_returns_flags_and_snippets(): void
    {
        $this->wpCodeToCodeSnippets->method('sourceActive')->willReturn(true);
        $this->wpCodeToCodeSnippets->method('destinationActive')->willReturn(true);
        $this->wpCodeToCodeSnippets->method('getMigratableSnippets')->willReturn([['id' => 1]]);

        $request  = new WP_REST_Request(['direction' => 'wpcode-to-code-snippets']);
        $response = $this->controller->get_migration_status($request);

        $this->assertSame(200, $response->status);
        $this->assertSame([
            'sourceActive'      => true,
            'destinationActive' => true,
            'snippets'          => [['id' => 1]],
        ], $response->data);
    }

    public function test_get_migration_status_returns_false_flags_and_empty_snippets_when_source_inactive(): void
    {
        $this->wpCodeToCodeSnippets->method('sourceActive')->willReturn(false);
        $this->wpCodeToCodeSnippets->method('destinationActive')->willReturn(false);
        $this->wpCodeToCodeSnippets->method('getMigratableSnippets')->willReturn([]);

        $request  = new WP_REST_Request(['direction' => 'wpcode-to-code-snippets']);
        $response = $this->controller->get_migration_status($request);

        $this->assertSame(200, $response->status);
        $this->assertFalse($response->data['sourceActive']);
        $this->assertFalse($response->data['destinationActive']);
        $this->assertSame([], $response->data['snippets']);
    }

    // ── migrate ───────────────────────────────────────────────────────────────

    public function test_migrate_returns_400_when_not_ready(): void
    {
        $this->wpCodeToCodeSnippets->method('isReady')->willReturn(false);
        $this->wpCodeToCodeSnippets->expects($this->never())->method('migrate');

        $request  = new WP_REST_Request(['direction' => 'wpcode-to-code-snippets', 'ids' => [1]]);
        $response = $this->controller->migrate($request);

        $this->assertSame(400, $response->status);
    }

    public function test_migrate_returns_200_with_per_item_results_on_success(): void
    {
        $results = [
            ['id' => 1, 'status' => 'migrated'],
            ['id' => 2, 'status' => 'error', 'error' => 'Snippet not found.'],
        ];
        $this->wpCodeToCodeSnippets->method('isReady')->willReturn(true);
        $this->wpCodeToCodeSnippets->method('migrate')->with([1, 2])->willReturn($results);

        $request  = new WP_REST_Request(['direction' => 'wpcode-to-code-snippets', 'ids' => [1, 2]]);
        $response = $this->controller->migrate($request);

        $this->assertSame(200, $response->status);
        $this->assertSame($results, $response->data);
    }

    public function test_migrate_returns_500_on_unexpected_runtime_exception(): void
    {
        $this->wpCodeToCodeSnippets->method('isReady')->willReturn(true);
        $this->wpCodeToCodeSnippets->method('migrate')->willThrowException(new \RuntimeException('Unexpected failure.'));

        $request  = new WP_REST_Request(['direction' => 'wpcode-to-code-snippets', 'ids' => [1]]);
        $response = $this->controller->migrate($request);

        $this->assertSame(500, $response->status);
    }
}
