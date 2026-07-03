<?php

namespace Loopress\Tests\Unit\Infrastructure;

use Brain\Monkey;
use Loopress\Infrastructure\LoopressEnvironment;
use PHPUnit\Framework\TestCase;

class LoopressEnvironmentTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->tmpDir = sys_get_temp_dir() . '/loopress-test-' . uniqid();
        mkdir($this->tmpDir, 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir

        // Make WP_CONTENT_DIR point to our temp dir so LoopressEnvironment uses it
        if (!defined('WP_CONTENT_DIR')) {
            define('WP_CONTENT_DIR', $this->tmpDir);
        }
    }

    protected function tearDown(): void
    {
        // WP_CONTENT_DIR is a constant so it keeps the first setUp's value across tests.
        // Always wipe the dx dir to prevent composer.json leaking between tests.
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
            is_dir($path) ? $this->rrmdir($path) : unlink($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
        }
        rmdir($dir); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
    }

    // ── getDxDir ─────────────────────────────────────────────────────────────

    public function test_getDxDir_ends_with_slash(): void
    {
        $env = new LoopressEnvironment();
        $this->assertStringEndsWith('/', $env->getDxDir());
    }

    public function test_getDxDir_contains_dx_segment(): void
    {
        $env = new LoopressEnvironment();
        $this->assertStringContainsString('/loopress/', $env->getDxDir());
    }

    // ── ensureInitialized ─────────────────────────────────────────────────────

    public function test_ensureInitialized_creates_directory(): void
    {
        $env    = new LoopressEnvironment();
        $dxDir  = $env->getDxDir();

        $this->assertDirectoryDoesNotExist($dxDir);
        $env->ensureInitialized();
        $this->assertDirectoryExists($dxDir);
    }

    public function test_ensureInitialized_creates_composer_json(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        $composerJson = $env->getDxDir() . 'composer.json';
        $this->assertFileExists($composerJson);
    }

    public function test_ensureInitialized_writes_valid_json(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        $json = $env->readComposerJson();
        $this->assertArrayHasKey('name', $json);
        $this->assertArrayHasKey('config', $json);
        $this->assertArrayHasKey('platform', $json['config']);
        $this->assertArrayHasKey('php', $json['config']['platform']);
    }

    public function test_ensureInitialized_sets_current_php_version(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        $json = $env->readComposerJson();
        $this->assertSame(PHP_VERSION, $json['config']['platform']['php']);
    }

    public function test_ensureInitialized_fixes_mismatched_platform_php(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        // Manually set a wrong version
        $json = $env->readComposerJson();
        $json['config']['platform']['php'] = '8.0.0';
        $env->writeComposerJson($json);

        // ensureInitialized is memoized per instance (one run per request), so use a
        // fresh instance to simulate the next request: it should fix the mismatch.
        $env2 = new LoopressEnvironment();
        $env2->ensureInitialized();
        $updated = $env2->readComposerJson();
        $this->assertSame(PHP_VERSION, $updated['config']['platform']['php']);
    }

    public function test_ensureInitialized_runs_at_most_once_per_instance(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        // Corrupt the platform version, then re-call on the same instance:
        // memoization means no re-check happens within the same request.
        $json = $env->readComposerJson();
        $json['config']['platform']['php'] = '8.0.0';
        $env->writeComposerJson($json);

        $env->ensureInitialized();
        $this->assertSame('8.0.0', $env->readComposerJson()['config']['platform']['php']);
    }

    // ── deleteComposerLock ───────────────────────────────────────────────────

    public function test_deleteComposerLock_removes_the_file(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();
        $env->writeComposerLock('{"packages": []}');

        $this->assertNotNull($env->readComposerLock());
        $env->deleteComposerLock();
        $this->assertNull($env->readComposerLock());
    }

    public function test_deleteComposerLock_is_a_noop_when_file_missing(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        $env->deleteComposerLock();
        $this->assertNull($env->readComposerLock());
    }

    // ── readComposerJson / writeComposerJson ─────────────────────────────────

    public function test_readComposerJson_returns_empty_array_when_file_missing(): void
    {
        $env = new LoopressEnvironment();
        $this->assertSame([], $env->readComposerJson());
    }

    public function test_write_and_read_roundtrip(): void
    {
        $env = new LoopressEnvironment();
        mkdir($env->getDxDir(), 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir

        $data = ['name' => 'test/package', 'require' => ['vendor/pkg' => '^1.0']];
        $env->writeComposerJson($data);

        $read = $env->readComposerJson();
        $this->assertSame('test/package', $read['name']);
        $this->assertSame('^1.0', $read['require']['vendor/pkg']);
    }

    // ── getAutoloadPath ───────────────────────────────────────────────────────

    public function test_getAutoloadPath_returns_null_when_file_missing(): void
    {
        $env = new LoopressEnvironment();
        $this->assertNull($env->getAutoloadPath());
    }

    public function test_getAutoloadPath_returns_path_when_file_exists(): void
    {
        $env    = new LoopressEnvironment();
        $dxDir  = $env->getDxDir();
        mkdir($dxDir . 'vendor', 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
        file_put_contents($dxDir . 'vendor/autoload.php', '<?php'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

        $this->assertSame($dxDir . 'vendor/autoload.php', $env->getAutoloadPath());
    }
}
