<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\Infrastructure;

use Loopress\Api\Infrastructure\ApiDirectory;
use PHPUnit\Framework\TestCase;

class ApiDirectoryTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tmpDir = sys_get_temp_dir() . '/loopress-api-test-' . uniqid();
        mkdir($this->tmpDir, 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir

        if (!defined('WP_CONTENT_DIR')) {
            define('WP_CONTENT_DIR', $this->tmpDir);
        }
    }

    protected function tearDown(): void
    {
        $this->rrmdir(WP_CONTENT_DIR . '/loopress');
        $this->rrmdir($this->tmpDir);
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
            is_dir($path) ? $this->rrmdir($path) : unlink($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
        }

        rmdir($dir); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
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
        file_put_contents($this->apiPath() . 'index.php', 'custom'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

        $dir->ensureExists();

        $this->assertSame('custom', file_get_contents($this->apiPath() . 'index.php')); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
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
}
