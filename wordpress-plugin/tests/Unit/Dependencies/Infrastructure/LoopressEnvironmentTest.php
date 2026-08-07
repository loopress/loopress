<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Dependencies\Infrastructure;

use Brain\Monkey;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
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

    // Bypasses writeComposerJson() (which always reasserts the LoopressLib\ autoload entry,
    // see the fix covered by test_writeComposerJson_does_not_let_its_own_write_undo_the_
    // migration_ensureInitialized_just_performed below) to fabricate a composer.json exactly
    // as a real site's would look if its file predates lib/'s introduction entirely: written
    // by code that never knew about this key, not by anything currently in this class.
    private function writeLegacyComposerJson(LoopressEnvironment $env, array $json): void
    {
        file_put_contents($env->getLoopressDir() . 'composer.json', json_encode($json, JSON_PRETTY_PRINT)); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents, WordPress.WP.AlternativeFunctions.json_encode_json_encode
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

    // ── getLoopressDir ─────────────────────────────────────────────────────────────

    public function test_getLoopressDir_ends_with_slash(): void
    {
        $env = new LoopressEnvironment();
        $this->assertStringEndsWith('/', $env->getLoopressDir());
    }

    public function test_getLoopressDir_contains_loopress_segment(): void
    {
        $env = new LoopressEnvironment();
        $this->assertStringContainsString('/loopress/', $env->getLoopressDir());
    }

    // ── ensureInitialized ─────────────────────────────────────────────────────

    public function test_ensureInitialized_creates_directory(): void
    {
        $env    = new LoopressEnvironment();
        $loopressDir  = $env->getLoopressDir();

        $this->assertDirectoryDoesNotExist($loopressDir);
        $env->ensureInitialized();
        $this->assertDirectoryExists($loopressDir);
    }

    public function test_ensureInitialized_creates_composer_json(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        $composerJson = $env->getLoopressDir() . 'composer.json';
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

    public function test_ensureInitialized_sets_the_lib_autoload_entry_on_a_new_site(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        $json = $env->readComposerJson();
        $this->assertSame('lib/', $json['autoload']['psr-4']['LoopressLib\\']);
    }

    public function test_ensureInitialized_does_not_flag_a_dump_for_a_new_site(): void
    {
        // The key is already correct from the moment composer.json is first written, no
        // stale generated autoloader to repair.
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        $this->assertFalse($env->needsLibAutoloadDump());
    }

    public function test_ensureInitialized_creates_the_lib_directory_with_an_anti_listing_index(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        $libDir = $env->getLoopressDir() . 'lib/';
        $this->assertDirectoryExists($libDir);
        $this->assertFileExists($libDir . 'index.php');
    }

    public function test_ensureInitialized_migrates_a_composer_json_missing_the_lib_autoload_entry(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();

        // Simulate a site whose composer.json predates the lib/ autoload entry.
        $json = $env->readComposerJson();
        unset($json['autoload']);
        $this->writeLegacyComposerJson($env, $json);

        // ensureInitialized is memoized per instance (one run per request), so use a fresh
        // instance to simulate the next request: it should add the missing entry.
        $env2 = new LoopressEnvironment();
        $env2->ensureInitialized();

        $migrated = $env2->readComposerJson();
        $this->assertSame('lib/', $migrated['autoload']['psr-4']['LoopressLib\\']);
    }

    public function test_needsLibAutoloadDump_is_true_right_after_migrating_an_existing_composer_json(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();
        $json = $env->readComposerJson();
        unset($json['autoload']);
        $this->writeLegacyComposerJson($env, $json);

        $env2 = new LoopressEnvironment();
        $env2->ensureInitialized();

        $this->assertTrue($env2->needsLibAutoloadDump());
    }

    public function test_needsLibAutoloadDump_resets_after_being_read_once(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();
        $json = $env->readComposerJson();
        unset($json['autoload']);
        $this->writeLegacyComposerJson($env, $json);

        $env2 = new LoopressEnvironment();
        $env2->ensureInitialized();

        $this->assertTrue($env2->needsLibAutoloadDump());
        $this->assertFalse($env2->needsLibAutoloadDump());
    }

    public function test_writeComposerJson_does_not_let_its_own_write_undo_the_migration_ensureInitialized_just_performed(): void
    {
        // Regression for the QA 7th-pass HIGH finding: ComposerService::sync() (the code
        // behind `lps composer push`) calls writeComposerJson() directly with the client's
        // raw composer.json, which never contains the LoopressLib\ entry (neither the `lps
        // composer init` scaffold nor a hand-written one would). writeComposerJson() calls
        // ensureInitialized() internally, which migrates a legacy file by writing the patched
        // JSON to disk via its own nested writeComposerJson() call -- but the outer call used
        // to immediately overwrite that patch with its own, unmigrated $json parameter.
        $bootstrap = new LoopressEnvironment();
        $bootstrap->ensureInitialized();
        $legacyJson = $bootstrap->readComposerJson();
        unset($legacyJson['autoload']);
        $this->writeLegacyComposerJson($bootstrap, $legacyJson);

        // A fresh instance, matching how each request gets its own LoopressEnvironment: the
        // bug only reproduces when ensureInitialized() hasn't already run on this instance,
        // since writeComposerJson() triggers it internally on first use.
        $env        = new LoopressEnvironment();
        $clientJson = ['name' => 'loopress/site-dependencies', 'require' => ['vendor/pkg' => '^1.0']];
        $env->writeComposerJson($clientJson);

        $written = $env->readComposerJson();
        $this->assertSame('lib/', $written['autoload']['psr-4']['LoopressLib\\']);
        $this->assertSame('^1.0', $written['require']['vendor/pkg']); // caller's own content still lands
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
        mkdir($env->getLoopressDir(), 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir

        $data = ['name' => 'test/package', 'require' => ['vendor/pkg' => '^1.0']];
        $env->writeComposerJson($data);

        $read = $env->readComposerJson();
        $this->assertSame('test/package', $read['name']);
        $this->assertSame('^1.0', $read['require']['vendor/pkg']);
    }

    // ── readComposerJsonRaw ───────────────────────────────────────────────────

    public function test_readComposerJsonRaw_returns_null_when_file_missing(): void
    {
        $env = new LoopressEnvironment();
        $this->assertNull($env->readComposerJsonRaw());
    }

    public function test_readComposerJsonRaw_returns_file_contents(): void
    {
        $env = new LoopressEnvironment();
        $env->ensureInitialized();
        $env->writeComposerJson(['name' => 'test/package']);

        $raw = $env->readComposerJsonRaw();
        $this->assertIsString($raw);
        $this->assertSame('test/package', json_decode($raw, true)['name']); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_decode_json_decode
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
        $loopressDir  = $env->getLoopressDir();
        mkdir($loopressDir . 'vendor', 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
        file_put_contents($loopressDir . 'vendor/autoload.php', '<?php'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

        $this->assertSame($loopressDir . 'vendor/autoload.php', $env->getAutoloadPath());
    }
}
