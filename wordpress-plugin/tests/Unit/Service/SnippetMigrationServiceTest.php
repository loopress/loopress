<?php

namespace Loopress\Tests\Unit\Service;

use Loopress\Snippets\Contract\SnippetProvider;
use Loopress\Snippets\Service\SnippetMigrationService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class SnippetMigrationServiceTest extends TestCase
{
    private function provider(bool $active): SnippetProvider&MockObject
    {
        $provider = $this->createMock(SnippetProvider::class);
        $provider->method('isActive')->willReturn($active);

        return $provider;
    }

    // ── readiness ─────────────────────────────────────────────────────────────

    public function test_is_ready_true_only_when_both_source_and_destination_are_active(): void
    {
        $service = new SnippetMigrationService($this->provider(true), $this->provider(true));

        $this->assertTrue($service->isReady());
    }

    public function test_is_ready_false_when_source_inactive(): void
    {
        $service = new SnippetMigrationService($this->provider(false), $this->provider(true));

        $this->assertFalse($service->isReady());
    }

    public function test_is_ready_false_when_destination_inactive(): void
    {
        $service = new SnippetMigrationService($this->provider(true), $this->provider(false));

        $this->assertFalse($service->isReady());
    }

    // ── getMigratableSnippets ────────────────────────────────────────────────

    public function test_get_migratable_snippets_returns_source_snippets_when_source_active(): void
    {
        $source = $this->provider(true);
        $source->method('getSnippets')->willReturn([['id' => 1]]);

        $service = new SnippetMigrationService($source, $this->provider(false));

        $this->assertSame([['id' => 1]], $service->getMigratableSnippets());
    }

    public function test_get_migratable_snippets_returns_empty_array_when_source_inactive(): void
    {
        $source = $this->provider(false);
        $source->expects($this->never())->method('getSnippets');

        $service = new SnippetMigrationService($source, $this->provider(true));

        $this->assertSame([], $service->getMigratableSnippets());
    }

    // ── migrate: preconditions ───────────────────────────────────────────────

    public function test_migrate_throws_when_source_inactive(): void
    {
        $service = new SnippetMigrationService($this->provider(false), $this->provider(true));

        $this->expectException(\RuntimeException::class);
        $service->migrate([1]);
    }

    public function test_migrate_throws_when_destination_inactive(): void
    {
        $service = new SnippetMigrationService($this->provider(true), $this->provider(false));

        $this->expectException(\RuntimeException::class);
        $service->migrate([1]);
    }

    public function test_migrate_throws_when_both_inactive(): void
    {
        $service = new SnippetMigrationService($this->provider(false), $this->provider(false));

        $this->expectException(\RuntimeException::class);
        $service->migrate([1]);
    }

    // ── migrate: per-item outcomes ───────────────────────────────────────────

    public function test_migrate_happy_path_creates_in_destination_then_deactivates_source(): void
    {
        $snippet = ['id' => 1, 'name' => 'Tracking script', 'code' => '<script></script>'];

        $source = $this->provider(true);
        $source->method('getSnippet')->with(1)->willReturn($snippet);
        $source->expects($this->once())->method('updateSnippet')->with(1, ['active' => false]);

        $destination = $this->provider(true);
        $destination->expects($this->once())->method('createSnippet')->with($snippet);

        $service = new SnippetMigrationService($source, $destination);

        $this->assertSame([['id' => 1, 'status' => 'migrated']], $service->migrate([1]));
    }

    public function test_migrate_reports_not_found_when_source_snippet_missing(): void
    {
        $source = $this->provider(true);
        $source->method('getSnippet')->with(1)->willReturn(null);

        $destination = $this->provider(true);
        $destination->expects($this->never())->method('createSnippet');

        $service = new SnippetMigrationService($source, $destination);

        $this->assertSame(
            [['id' => 1, 'status' => 'error', 'error' => 'Snippet not found.']],
            $service->migrate([1]),
        );
    }

    public function test_migrate_reports_error_and_does_not_deactivate_source_when_destination_create_throws(): void
    {
        $snippet = ['id' => 1, 'name' => 'Body snippet', 'location' => 'body'];

        $source = $this->provider(true);
        $source->method('getSnippet')->with(1)->willReturn($snippet);
        $source->expects($this->never())->method('updateSnippet');

        $destination = $this->provider(true);
        $destination->method('createSnippet')->willThrowException(
            new \RuntimeException('Code Snippets does not support the "body" location.'),
        );

        $service = new SnippetMigrationService($source, $destination);

        $this->assertSame(
            [['id' => 1, 'status' => 'error', 'error' => 'Code Snippets does not support the "body" location.']],
            $service->migrate([1]),
        );
    }

    public function test_migrate_reports_migrated_with_warning_when_deactivation_fails_after_successful_create(): void
    {
        $snippet = ['id' => 1, 'name' => 'Tracking script'];

        $source = $this->provider(true);
        $source->method('getSnippet')->with(1)->willReturn($snippet);
        $source->method('updateSnippet')->willThrowException(new \RuntimeException('Post already trashed.'));

        $destination = $this->provider(true);
        $destination->method('createSnippet')->willReturn($snippet);

        $service = new SnippetMigrationService($source, $destination);

        $result = $service->migrate([1]);

        $this->assertSame('migrated', $result[0]['status']);
        $this->assertArrayHasKey('warning', $result[0]);
        $this->assertStringContainsString('Post already trashed.', $result[0]['warning']);
    }

    public function test_migrate_processes_partial_batch_with_mixed_results(): void
    {
        $source = $this->provider(true);
        $source->method('getSnippet')->willReturnMap([
            [1, ['id' => 1, 'name' => 'OK']],
            [2, null],
            [3, ['id' => 3, 'name' => 'Bad location']],
        ]);

        $destination = $this->provider(true);
        $destination->method('createSnippet')->willReturnCallback(function (array $snippet) {
            if ($snippet['id'] === 3) {
                throw new \RuntimeException('Unsupported location.');
            }
            return $snippet;
        });

        $service = new SnippetMigrationService($source, $destination);

        $results = $service->migrate([1, 2, 3]);

        $this->assertSame(1, $results[0]['id']);
        $this->assertSame('migrated', $results[0]['status']);

        $this->assertSame(2, $results[1]['id']);
        $this->assertSame('error', $results[1]['status']);
        $this->assertSame('Snippet not found.', $results[1]['error']);

        $this->assertSame(3, $results[2]['id']);
        $this->assertSame('error', $results[2]['status']);
        $this->assertSame('Unsupported location.', $results[2]['error']);
    }

    public function test_migrate_deduplicates_ids(): void
    {
        $source = $this->provider(true);
        $source->method('getSnippet')->with(1)->willReturn(['id' => 1]);

        $destination = $this->provider(true);
        $destination->expects($this->once())->method('createSnippet');

        $service = new SnippetMigrationService($source, $destination);

        $this->assertCount(1, $service->migrate([1, 1]));
    }
}
