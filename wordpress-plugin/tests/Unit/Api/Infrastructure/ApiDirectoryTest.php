<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Api\Infrastructure\ApiDirectory;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Exception\IOException;
use Symfony\Component\Filesystem\Filesystem;

class ApiDirectoryTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        // Default: filters are a passthrough, so maxFileBytes()/maxTotalBytes() return their
        // constants. The size-limit tests below override this.
        Functions\when('apply_filters')->alias(static fn (string $hook, mixed $value = null): mixed => $value);

        $this->tmpDir = sys_get_temp_dir() . '/loopress-api-test-' . uniqid();
        mkdir($this->tmpDir, 0755, true);

        if (!defined('WP_CONTENT_DIR')) {
            define('WP_CONTENT_DIR', $this->tmpDir);
        }
    }

    protected function tearDown(): void
    {
        $this->rrmdir(WP_CONTENT_DIR . '/loopress');
        $this->rrmdir($this->tmpDir);
        Monkey\tearDown();
        parent::tearDown();
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        foreach (scandir($dir) as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            $path = $dir . '/' . $item;
            is_dir($path) ? $this->rrmdir($path) : unlink($path);
        }

        rmdir($dir);
    }

    private function apiPath(): string
    {
        return WP_CONTENT_DIR . '/loopress/api/';
    }

    // ── ensureExists ─────────────────────────────────────────────────────────

    public function test_ensureExists_creates_the_directory(): void
    {
        $dir = new ApiDirectory();

        $this->assertDirectoryDoesNotExist($this->apiPath());
        $dir->ensureExists();
        $this->assertDirectoryExists($this->apiPath());
    }

    public function test_ensureExists_creates_an_empty_index_php(): void
    {
        $dir = new ApiDirectory();
        $dir->ensureExists();

        $this->assertFileExists($this->apiPath() . 'index.php');
    }

    public function test_ensureExists_does_not_overwrite_an_existing_index_php(): void
    {
        $dir = new ApiDirectory();
        $dir->ensureExists();
        file_put_contents($this->apiPath() . 'index.php', 'custom');

        $dir->ensureExists();

        $this->assertSame('custom', file_get_contents($this->apiPath() . 'index.php'));
    }

    // ── write / read ─────────────────────────────────────────────────────────

    public function test_write_then_read_round_trips_the_content(): void
    {
        $dir = new ApiDirectory();

        $dir->write('hello', "<?php\nfinal class Hello {}\n");

        $this->assertSame("<?php\nfinal class Hello {}\n", $dir->read('hello'));
    }

    public function test_write_creates_the_directory_if_missing(): void
    {
        $dir = new ApiDirectory();

        $dir->write('hello', '<?php');

        $this->assertFileExists($dir->filePath('hello'));
    }

    public function test_read_returns_null_for_a_missing_file(): void
    {
        $dir = new ApiDirectory();
        $dir->ensureExists();

        $this->assertNull($dir->read('missing'));
    }

    // ── size limits ──────────────────────────────────────────────────────────

    public function test_maxFileBytes_and_maxTotalBytes_default_to_the_constants(): void
    {
        $dir = new ApiDirectory();

        $this->assertSame(512 * 1024, $dir->maxFileBytes());
        $this->assertSame(8 * 1024 * 1024, $dir->maxTotalBytes());
    }

    public function test_maxFileBytes_is_filterable(): void
    {
        Functions\when('apply_filters')->alias(
            static fn (string $hook, mixed $value = null): mixed => $hook === 'loopress_max_file_bytes' ? 4096 : $value,
        );
        $dir = new ApiDirectory();

        $this->assertSame(4096, $dir->maxFileBytes());
    }

    public function test_fileSize_returns_the_byte_count_of_an_existing_file(): void
    {
        $dir = new ApiDirectory();
        $dir->write('hello', 'abcde');

        $this->assertSame(5, $dir->fileSize('hello'));
    }

    public function test_fileSize_returns_null_for_a_missing_file(): void
    {
        $dir = new ApiDirectory();
        $dir->ensureExists();

        $this->assertNull($dir->fileSize('missing'));
    }

    // ── delete ───────────────────────────────────────────────────────────────

    public function test_delete_removes_an_existing_file_and_returns_true(): void
    {
        $dir = new ApiDirectory();
        $dir->write('hello', '<?php');
        $this->assertTrue(is_file($dir->filePath('hello')));

        $this->assertTrue($dir->delete('hello'));
        $this->assertFalse(is_file($dir->filePath('hello')));
    }

    public function test_delete_returns_false_for_a_missing_file(): void
    {
        $dir = new ApiDirectory();
        $dir->ensureExists();

        $this->assertFalse($dir->delete('never-there'));
    }

    public function test_delete_removes_a_nested_file(): void
    {
        $dir = new ApiDirectory();
        $dir->write('invoice-pdf/[order_id]', '<?php');

        $this->assertTrue($dir->delete('invoice-pdf/[order_id]'));
        $this->assertSame([], $dir->listSlugs());
    }

    // ── listSlugs ────────────────────────────────────────────────────────────

    public function test_listSlugs_returns_empty_array_when_directory_missing(): void
    {
        $dir = new ApiDirectory();

        $this->assertSame([], $dir->listSlugs());
    }

    public function test_listSlugs_returns_php_filenames_without_extension(): void
    {
        $dir = new ApiDirectory();
        $dir->write('hello', '<?php');
        $dir->write('hello-world', '<?php');

        $slugs = $dir->listSlugs();
        sort($slugs);

        $this->assertSame(['hello', 'hello-world'], $slugs);
    }

    public function test_listSlugs_ignores_index_php(): void
    {
        $dir = new ApiDirectory();
        $dir->write('hello', '<?php');

        $this->assertSame(['hello'], $dir->listSlugs());
    }

    public function test_listSlugs_returns_a_relative_path_for_a_nested_file(): void
    {
        $dir = new ApiDirectory();
        $dir->write('invoice-pdf/[order_id]', '<?php');

        $this->assertSame(['invoice-pdf/[order_id]'], $dir->listSlugs());
    }

    public function test_listSlugs_returns_a_relative_path_for_multiple_dynamic_segments(): void
    {
        $dir = new ApiDirectory();
        $dir->write('orders/[order_id]/items/[item_id]', '<?php');

        $this->assertSame(['orders/[order_id]/items/[item_id]'], $dir->listSlugs());
    }

    public function test_listSlugs_mixes_top_level_and_nested_files(): void
    {
        $dir = new ApiDirectory();
        $dir->write('hello', '<?php');
        $dir->write('invoice-pdf/[order_id]', '<?php');

        $slugs = $dir->listSlugs();
        sort($slugs);

        $this->assertSame(['hello', 'invoice-pdf/[order_id]'], $slugs);
    }

    public function test_listSlugs_ignores_a_nested_index_php(): void
    {
        $dir = new ApiDirectory();
        $dir->write('invoice-pdf/[order_id]', '<?php');
        file_put_contents($dir->filePath('invoice-pdf/index'), '<?php // not a route');

        $this->assertSame(['invoice-pdf/[order_id]'], $dir->listSlugs());
    }

    // ── batch staging / atomic swap (#236) ─────────────────────────────────────

    private function stagingPath(): string
    {
        return WP_CONTENT_DIR . '/loopress/api.staging/';
    }

    public function test_beginBatch_creates_an_empty_staging_directory_with_an_index_php(): void
    {
        $dir = new ApiDirectory();

        $dir->beginBatch();

        $this->assertDirectoryExists($this->stagingPath());
        $this->assertFileExists($this->stagingPath() . 'index.php');
        $this->assertSame([], $dir->listStagedSlugs());
    }

    public function test_beginBatch_seeds_staging_with_a_copy_of_every_live_file(): void
    {
        $dir = new ApiDirectory();
        $dir->write('hello', '<?php live content');

        $dir->beginBatch();

        $this->assertSame(['hello'], $dir->listStagedSlugs());
        $this->assertSame('<?php live content', $dir->readStaged('hello'));
        // A copy, not the same file: the live one must still be there and untouched.
        $this->assertSame('<?php live content', $dir->read('hello'));
    }

    public function test_beginBatch_discards_a_leftover_staging_directory_from_a_crashed_previous_batch(): void
    {
        $dir = new ApiDirectory();
        $dir->beginBatch();
        $dir->stageWrite('stray', '<?php from a batch that never committed');

        $dir->beginBatch();

        $this->assertSame([], $dir->listStagedSlugs());
    }

    public function test_stageWrite_writes_into_staging_only_never_the_live_directory(): void
    {
        $dir = new ApiDirectory();
        $dir->beginBatch();

        $dir->stageWrite('hello', '<?php staged content');

        $this->assertSame('<?php staged content', $dir->readStaged('hello'));
        $this->assertNull($dir->read('hello'));
    }

    public function test_stageDelete_removes_a_file_from_the_staged_batch_only(): void
    {
        $dir = new ApiDirectory();
        $dir->write('hello', '<?php live content');
        $dir->beginBatch();

        $dir->stageDelete('hello');

        $this->assertNull($dir->readStaged('hello'));
        // Live is untouched until commitBatch() actually swaps.
        $this->assertSame('<?php live content', $dir->read('hello'));
    }

    public function test_stageDelete_is_a_no_op_for_a_slug_never_staged(): void
    {
        $dir = new ApiDirectory();
        $dir->beginBatch();

        $dir->stageDelete('never-there');

        $this->assertSame([], $dir->listStagedSlugs());
    }

    public function test_readStaged_returns_null_for_a_missing_slug(): void
    {
        $dir = new ApiDirectory();
        $dir->beginBatch();

        $this->assertNull($dir->readStaged('missing'));
    }

    public function test_stagedFileSize_returns_the_byte_count_of_a_staged_file(): void
    {
        $dir = new ApiDirectory();
        $dir->beginBatch();
        $dir->stageWrite('hello', 'abcde');

        $this->assertSame(5, $dir->stagedFileSize('hello'));
    }

    public function test_stagedFileSize_returns_null_for_a_missing_slug(): void
    {
        $dir = new ApiDirectory();
        $dir->beginBatch();

        $this->assertNull($dir->stagedFileSize('missing'));
    }

    public function test_commitBatch_makes_the_staged_content_live_and_removes_the_staging_directory(): void
    {
        $dir = new ApiDirectory();
        $dir->beginBatch();
        $dir->stageWrite('hello', '<?php new content');

        $dir->commitBatch();

        $this->assertSame('<?php new content', $dir->read('hello'));
        $this->assertDirectoryDoesNotExist($this->stagingPath());
    }

    public function test_commitBatch_preserves_a_live_file_the_batch_never_touched(): void
    {
        $dir = new ApiDirectory();
        $dir->write('keep', '<?php untouched');
        $dir->beginBatch();
        $dir->stageWrite('new-file', '<?php brand new');

        $dir->commitBatch();

        $this->assertSame('<?php untouched', $dir->read('keep'));
        $this->assertSame('<?php brand new', $dir->read('new-file'));
    }

    public function test_commitBatch_removes_a_live_file_that_was_staged_for_deletion(): void
    {
        $dir = new ApiDirectory();
        $dir->write('keep', '<?php stays');
        $dir->write('old', '<?php goes');
        $dir->beginBatch();
        $dir->stageDelete('old');

        $dir->commitBatch();

        $this->assertSame('<?php stays', $dir->read('keep'));
        $this->assertNull($dir->read('old'));
    }

    public function test_commitBatch_throws_and_leaves_the_live_directory_untouched_without_a_staged_batch(): void
    {
        $dir = new ApiDirectory();
        $dir->write('hello', '<?php still here');

        $this->expectException(\RuntimeException::class);

        try {
            $dir->commitBatch();
        } finally {
            $this->assertSame('<?php still here', $dir->read('hello'));
        }
    }

    public function test_abortBatch_discards_the_staged_batch_without_touching_the_live_directory(): void
    {
        $dir = new ApiDirectory();
        $dir->write('hello', '<?php live content');
        $dir->beginBatch();
        $dir->stageWrite('hello', '<?php would-be new content');
        $dir->stageWrite('new-file', '<?php never committed');

        $dir->abortBatch();

        $this->assertDirectoryDoesNotExist($this->stagingPath());
        $this->assertSame('<?php live content', $dir->read('hello'));
        $this->assertNull($dir->read('new-file'));
    }

    public function test_abortBatch_is_a_no_op_when_nothing_is_staged(): void
    {
        $dir = new ApiDirectory();

        $dir->abortBatch();

        $this->assertDirectoryDoesNotExist($this->stagingPath());
    }

    // A failure removing the now-obsolete backup, after the swap itself already succeeded, must
    // never be reported as a commitBatch() failure (CodeRabbit finding on PR #243): the
    // deployment landed, only cleanup of the old directory didn't. Not practically reproducible
    // on a real filesystem here (root in CI/this sandbox can remove almost anything regardless
    // of permissions), hence the one place in this file that injects a Filesystem double rather
    // than exercising the real one.
    public function test_commitBatch_does_not_fail_when_only_the_post_swap_backup_cleanup_fails(): void
    {
        $filesystem = $this->getMockBuilder(Filesystem::class)->onlyMethods(['remove'])->getMock();
        $filesystem->method('remove')->willThrowException(new IOException('simulated cleanup failure'));

        $dir = new ApiDirectory($filesystem);
        $dir->write('hello', '<?php old content');
        $dir->beginBatch();
        $dir->stageWrite('hello', '<?php new content');

        $dir->commitBatch();

        $this->assertSame('<?php new content', $dir->read('hello'));
    }
}
