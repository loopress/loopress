<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\Infrastructure;

use Loopress\Hooks\Infrastructure\HooksDirectory;
use PHPUnit\Framework\TestCase;

class HooksDirectoryTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tmpDir = sys_get_temp_dir() . '/loopress-hooks-test-' . uniqid();
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

    private function hooksPath(): string
    {
        return WP_CONTENT_DIR . '/loopress/hooks/';
    }

    // ── ensureExists ─────────────────────────────────────────────────────────

    public function test_ensureExists_creates_the_directory(): void
    {
        $dir = new HooksDirectory();

        $this->assertDirectoryDoesNotExist($this->hooksPath());
        $dir->ensureExists();
        $this->assertDirectoryExists($this->hooksPath());
    }

    public function test_ensureExists_creates_an_empty_index_php(): void
    {
        $dir = new HooksDirectory();
        $dir->ensureExists();

        $this->assertFileExists($this->hooksPath() . 'index.php');
    }

    public function test_ensureExists_does_not_overwrite_an_existing_index_php(): void
    {
        $dir = new HooksDirectory();
        $dir->ensureExists();
        file_put_contents($this->hooksPath() . 'index.php', 'custom'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

        $dir->ensureExists();

        $this->assertSame('custom', file_get_contents($this->hooksPath() . 'index.php')); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
    }

    // ── write / read ─────────────────────────────────────────────────────────

    public function test_write_then_read_round_trips_the_content(): void
    {
        $dir = new HooksDirectory();

        $dir->write('content-filters', "<?php\nfinal class ContentFilters {}\n");

        $this->assertSame("<?php\nfinal class ContentFilters {}\n", $dir->read('content-filters'));
    }

    public function test_write_creates_the_directory_if_missing(): void
    {
        $dir = new HooksDirectory();

        $dir->write('content-filters', '<?php');

        $this->assertFileExists($dir->filePath('content-filters'));
    }

    public function test_read_returns_null_for_a_missing_file(): void
    {
        $dir = new HooksDirectory();
        $dir->ensureExists();

        $this->assertNull($dir->read('missing'));
    }

    // ── listSlugs ────────────────────────────────────────────────────────────

    public function test_listSlugs_returns_empty_array_when_directory_missing(): void
    {
        $dir = new HooksDirectory();

        $this->assertSame([], $dir->listSlugs());
    }

    public function test_listSlugs_returns_php_filenames_without_extension(): void
    {
        $dir = new HooksDirectory();
        $dir->write('content-filters', '<?php');
        $dir->write('cleanup-cron', '<?php');

        $slugs = $dir->listSlugs();
        sort($slugs);

        $this->assertSame(['cleanup-cron', 'content-filters'], $slugs);
    }

    public function test_listSlugs_ignores_index_php(): void
    {
        $dir = new HooksDirectory();
        $dir->write('content-filters', '<?php');

        $this->assertSame(['content-filters'], $dir->listSlugs());
    }

    public function test_listSlugs_returns_a_relative_path_for_a_nested_file(): void
    {
        $dir = new HooksDirectory();
        $dir->write('content/filters', '<?php');

        $this->assertSame(['content/filters'], $dir->listSlugs());
    }

    public function test_listSlugs_mixes_top_level_and_nested_files(): void
    {
        $dir = new HooksDirectory();
        $dir->write('cleanup-cron', '<?php');
        $dir->write('content/filters', '<?php');

        $slugs = $dir->listSlugs();
        sort($slugs);

        $this->assertSame(['cleanup-cron', 'content/filters'], $slugs);
    }

    public function test_listSlugs_ignores_a_nested_index_php(): void
    {
        $dir = new HooksDirectory();
        $dir->write('content/filters', '<?php');
        file_put_contents($dir->filePath('content/index'), '<?php // not a hook file'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

        $this->assertSame(['content/filters'], $dir->listSlugs());
    }
}
