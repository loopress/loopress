<?php

declare(strict_types=1);

namespace Loopress\Tests\Contract;

use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Contract\SnippetType;
use Loopress\Snippets\RestApi\SnippetMigrationController;
use Loopress\Snippets\Service\SnippetMigrationService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class SnippetMigrationContractTest extends TestCase
{
    use AssertsJsonSchema;

    private SnippetMigrationService&MockObject $wpCodeToCodeSnippets;
    private SnippetMigrationService&MockObject $codeSnippetsToWpCode;
    private SnippetMigrationController $controller;

    protected function setUp(): void
    {
        parent::setUp();

        $this->wpCodeToCodeSnippets = $this->createMock(SnippetMigrationService::class);
        $this->codeSnippetsToWpCode = $this->createMock(SnippetMigrationService::class);
        $this->controller           = new SnippetMigrationController(
            $this->wpCodeToCodeSnippets,
            $this->codeSnippetsToWpCode,
        );
    }

    public function test_get_migration_status_response_matches_schema(): void
    {
        $this->wpCodeToCodeSnippets->method('sourceActive')->willReturn(true);
        $this->wpCodeToCodeSnippets->method('destinationActive')->willReturn(true);
        $this->wpCodeToCodeSnippets->method('getMigratableSnippets')->willReturn([
            new SnippetData(
                id: 1,
                name: 'Tracking script',
                code: '<script></script>',
                type: SnippetType::Js,
                active: true,
                description: '',
                tags: [],
                location: 'footer',
                insertMethod: 'auto',
                priority: 10,
                shortcodeAttributes: [],
            ),
        ]);

        $request  = new WP_REST_Request(['direction' => 'wpcode-to-code-snippets']);
        $response = $this->controller->get_migration_status($request);

        $this->assertMatchesSchema('snippet-migration-status.schema.json', $response->data);
    }

    public function test_migrate_response_matches_schema(): void
    {
        $this->wpCodeToCodeSnippets->method('isReady')->willReturn(true);
        $this->wpCodeToCodeSnippets->method('migrate')->willReturn([
            ['id' => 1, 'status' => 'migrated'],
            ['id' => 2, 'status' => 'error', 'error' => 'Snippet not found.'],
            ['id' => 3, 'status' => 'migrated', 'warning' => 'Copied, but could not deactivate the original.'],
        ]);

        $request  = new WP_REST_Request(['direction' => 'wpcode-to-code-snippets', 'ids' => [1, 2, 3]]);
        $response = $this->controller->migrate($request);

        $this->assertMatchesSchema('snippet-migration-results.schema.json', $response->data);
    }
}
