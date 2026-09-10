<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Api\Infrastructure\ApiDirectory;
use PHPUnit\Framework\TestCase;

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
}
