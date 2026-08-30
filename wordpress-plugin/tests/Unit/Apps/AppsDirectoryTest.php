<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Apps;

use Loopress\Apps\Infrastructure\AppsDirectory;
use PHPUnit\Framework\TestCase;

class AppsDirectoryTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tmpDir = sys_get_temp_dir() . '/loopress-apps-test-' . uniqid();
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

    // ── isValidAppName ──────────────────────────────────────────────────────

    public function test_isValidAppName_accepts_kebab_case(): void
    {
        $this->assertTrue(AppsDirectory::isValidAppName('search'));
        $this->assertTrue(AppsDirectory::isValidAppName('customer-portal'));
        $this->assertTrue(AppsDirectory::isValidAppName('a1'));
    }

    public function test_isValidAppName_rejects_uppercase_leading_or_trailing_hyphen_and_traversal(): void
    {
        $this->assertFalse(AppsDirectory::isValidAppName('Search'));
        $this->assertFalse(AppsDirectory::isValidAppName('-search'));
        $this->assertFalse(AppsDirectory::isValidAppName('search-'));
        $this->assertFalse(AppsDirectory::isValidAppName('..'));
        $this->assertFalse(AppsDirectory::isValidAppName('a/b'));
        $this->assertFalse(AppsDirectory::isValidAppName(''));
    }

    // ── isValidAssetPath ───────────────────────────────────────────────────

    public function test_isValidAssetPath_accepts_nested_hashed_assets(): void
    {
        $this->assertTrue(AppsDirectory::isValidAssetPath('index.html'));
        $this->assertTrue(AppsDirectory::isValidAssetPath('assets/index-9a597e0d.js'));
        $this->assertTrue(AppsDirectory::isValidAssetPath('assets/fonts/inter-latin.woff2'));
        $this->assertTrue(AppsDirectory::isValidAssetPath('favicon.ico'));
    }

    public function test_isValidAssetPath_rejects_executable_extensions(): void
    {
        $this->assertFalse(AppsDirectory::isValidAssetPath('shell.php'));
        $this->assertFalse(AppsDirectory::isValidAssetPath('assets/x.phtml'));
        $this->assertFalse(AppsDirectory::isValidAssetPath('assets/x.phar'));
        $this->assertFalse(AppsDirectory::isValidAssetPath('assets/noext'));
    }

    public function test_isValidAssetPath_rejects_path_traversal_and_absolute_paths(): void
    {
        $this->assertFalse(AppsDirectory::isValidAssetPath('../wp-config.php'));
        $this->assertFalse(AppsDirectory::isValidAssetPath('assets/../../evil.js'));
        $this->assertFalse(AppsDirectory::isValidAssetPath('/etc/passwd'));
        $this->assertFalse(AppsDirectory::isValidAssetPath('assets/..'));
    }

    // ── ensureExists ───────────────────────────────────────────────────────

    public function test_ensureExists_creates_dir_index_and_htaccess(): void
    {
        $dir = new AppsDirectory();
        $dir->ensureExists();

        $root = WP_CONTENT_DIR . '/loopress/apps/';
        $this->assertDirectoryExists($root);
        $this->assertFileExists($root . 'index.php');
        $this->assertStringContainsString('php_flag engine off', (string) file_get_contents($root . '.htaccess'));
    }

    // ── write / list / read / remove / delete ──────────────────────────────

    public function test_writeAsset_then_listAssets_reports_hash_and_size(): void
    {
        $dir = new AppsDirectory();
        $dir->writeAsset('search', 'assets/index-abc.js', 'console.log(1)');

        $assets = $dir->listAssets('search');

        $this->assertArrayHasKey('assets/index-abc.js', $assets);
        $this->assertSame(hash('sha256', 'console.log(1)'), $assets['assets/index-abc.js']['sha256']);
        $this->assertSame(14, $assets['assets/index-abc.js']['size']);
    }

    public function test_writeAsset_rejects_unsafe_path(): void
    {
        $dir = new AppsDirectory();

        $this->expectException(\InvalidArgumentException::class);
        $dir->writeAsset('search', '../evil.js', 'x');
    }

    public function test_readAsset_round_trips_and_returns_null_for_missing(): void
    {
        $dir = new AppsDirectory();
        $dir->writeAsset('search', 'assets/x.css', 'body{}');

        $this->assertSame('body{}', $dir->readAsset('search', 'assets/x.css'));
        $this->assertNull($dir->readAsset('search', 'assets/missing.css'));
        $this->assertNull($dir->readAsset('search', '../escape.css'));
    }

    public function test_removeAsset_and_deleteApp(): void
    {
        $dir = new AppsDirectory();
        $dir->writeAsset('search', 'a.js', '1');
        $dir->writeAsset('search', 'b.js', '2');

        $dir->removeAsset('search', 'a.js');
        $this->assertArrayNotHasKey('a.js', $dir->listAssets('search'));
        $this->assertTrue($dir->hasApp('search'));

        $dir->deleteApp('search');
        $this->assertFalse($dir->hasApp('search'));
    }

    public function test_listAppNames_only_returns_valid_directories(): void
    {
        $dir = new AppsDirectory();
        $dir->writeAsset('search', 'a.js', '1');
        $dir->writeAsset('customer-portal', 'a.js', '1');
        mkdir(WP_CONTENT_DIR . '/loopress/apps/.hidden'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir

        $this->assertSame(['customer-portal', 'search'], $dir->listAppNames());
    }
}
