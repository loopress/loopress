<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Hooks\Infrastructure\HooksDirectory;
use Loopress\Hooks\RestApi\HookLoader;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

// A global-namespace class (see TestHookLoaderCollisionFixtureClass.php), can't be PSR-4
// autoloaded: required explicitly so it already exists by the time
// test_loadAndRegister_skips_a_class_name_collision_without_registering_anything runs.
require_once __DIR__ . '/TestHookLoaderCollisionFixtureClass.php';

class HookLoaderTest extends TestCase
{
    private string $tmpDir;
    private HooksDirectory $directory;
    private LoopressEnvironment&MockObject $environment;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->tmpDir = sys_get_temp_dir() . '/loopress-hook-loader-test-' . uniqid();
        mkdir($this->tmpDir, 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
        if (!defined('WP_CONTENT_DIR')) {
            define('WP_CONTENT_DIR', $this->tmpDir);
        }

        $this->directory = new HooksDirectory();
        $this->environment = $this->createMock(LoopressEnvironment::class);
        $this->environment->method('getAutoloadPath')->willReturn(null);
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
            is_dir($path) ? $this->rrmdir($path) : unlink($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
        }

        rmdir($dir); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
    }

    // ── bindingsFor: actions ─────────────────────────────────────────────────

    public function test_bindingsFor_returns_one_action_binding_with_hook_priority_and_accepted_args(): void
    {
        $loader   = new HookLoader($this->directory, $this->environment);
        $bindings = $loader->bindingsFor(new HookLoaderTestFixtureAction(), 'slug');

        $this->assertCount(1, $bindings['actions']);
        $this->assertSame('init', $bindings['actions'][0]['hook']);
        $this->assertSame(20, $bindings['actions'][0]['priority']);
        $this->assertSame(2, $bindings['actions'][0]['acceptedArgs']);
        $this->assertSame([], $bindings['filters']);
        $this->assertSame([], $bindings['crons']);
    }

    public function test_bindingsFor_action_callback_forwards_all_received_args(): void
    {
        $instance = new HookLoaderTestFixtureAction();
        $loader   = new HookLoader($this->directory, $this->environment);
        $binding  = $loader->bindingsFor($instance, 'slug')['actions'][0];

        ($binding['callback'])('a-value', 'b-value');

        $this->assertSame(['a-value', 'b-value'], $instance->calledWith);
    }

    public function test_bindingsFor_action_callback_catches_a_throw_and_does_not_propagate(): void
    {
        $loader  = new HookLoader($this->directory, $this->environment);
        $binding = $loader->bindingsFor(new HookLoaderTestFixtureThrowingAction(), 'slug')['actions'][0];

        ($binding['callback'])();

        $this->assertTrue(true); // reaching this line means the throw was caught, not fatal
    }

    // ── bindingsFor: filters ─────────────────────────────────────────────────

    public function test_bindingsFor_returns_one_filter_binding_with_hook_and_priority(): void
    {
        $loader   = new HookLoader($this->directory, $this->environment);
        $bindings = $loader->bindingsFor(new HookLoaderTestFixtureFilter(), 'slug');

        $this->assertCount(1, $bindings['filters']);
        $this->assertSame('the_content', $bindings['filters'][0]['hook']);
        $this->assertSame(20, $bindings['filters'][0]['priority']);
    }

    public function test_bindingsFor_filter_callback_returns_the_methods_return_value(): void
    {
        $loader  = new HookLoader($this->directory, $this->environment);
        $binding = $loader->bindingsFor(new HookLoaderTestFixtureFilter(), 'slug')['filters'][0];

        $this->assertSame('hello-tweaked', ($binding['callback'])('hello'));
    }

    public function test_bindingsFor_filter_callback_returns_the_original_value_unchanged_on_a_throw(): void
    {
        $loader  = new HookLoader($this->directory, $this->environment);
        $binding = $loader->bindingsFor(new HookLoaderTestFixtureThrowingFilter(), 'slug')['filters'][0];

        $this->assertSame('original', ($binding['callback'])('original'));
    }

    public function test_bindingsFor_filter_binding_requests_at_least_one_accepted_arg_from_wp_even_when_declared_as_zero(): void
    {
        // add_filter()'s own $accepted_args controls how many args *our wrapper* receives from
        // WP, not how many the developer's method receives: it must stay at least 1 so the
        // wrapper always has the original value on hand for its fail-open path below, even for
        // a method that itself declares acceptedArgs: 0.
        $loader  = new HookLoader($this->directory, $this->environment);
        $binding = $loader->bindingsFor(new HookLoaderTestFixtureFilterZeroAcceptedArgs(), 'slug')['filters'][0];

        $this->assertSame(1, $binding['acceptedArgs']);
    }

    public function test_bindingsFor_filter_callback_falls_back_to_the_original_value_on_a_throw_even_with_zero_accepted_args(): void
    {
        $loader  = new HookLoader($this->directory, $this->environment);
        $binding = $loader->bindingsFor(new HookLoaderTestFixtureFilterZeroAcceptedArgs(), 'slug')['filters'][0];

        // The wrapper still receives 'original' as its own first argument (acceptedArgs was
        // bumped to 1 above), even though the user's zero-arg method never sees it.
        $this->assertSame('original', ($binding['callback'])('original'));
    }

    // ── bindingsFor: cron ────────────────────────────────────────────────────

    public function test_bindingsFor_returns_one_cron_binding_defaulting_the_hook_name(): void
    {
        $loader   = new HookLoader($this->directory, $this->environment);
        $bindings = $loader->bindingsFor(new HookLoaderTestFixtureCron(), 'cleanup-job');

        $this->assertCount(1, $bindings['crons']);
        $this->assertSame('loopress_hooks_cron_cleanup-job_cleanup', $bindings['crons'][0]['hook']);
        $this->assertSame('daily', $bindings['crons'][0]['recurrence']);
    }

    // ── bindingsFor: mixed ───────────────────────────────────────────────────

    public function test_bindingsFor_returns_all_three_kinds_for_a_mixed_class(): void
    {
        $loader   = new HookLoader($this->directory, $this->environment);
        $bindings = $loader->bindingsFor(new HookLoaderTestFixtureMixed(), 'slug');

        $this->assertCount(1, $bindings['actions']);
        $this->assertCount(1, $bindings['filters']);
        $this->assertCount(1, $bindings['crons']);
    }

    // ── loadAndRegister ──────────────────────────────────────────────────────

    public function test_loadAndRegister_binds_an_action(): void
    {
        $this->directory->write(
            'on-init',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Hooks\\RestApi;\nuse Loopress\\Hooks\\Attribute\\Action;\nfinal class TestLoaderOnInit\n{\n    #[Action('init', priority: 5)]\n    public function run(): void {}\n}\n",
        );

        Functions\expect('add_action')->once()->with('init', \Mockery::type(\Closure::class), 5, 1);
        Functions\when('update_option')->justReturn(true);

        $loader = new HookLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the expectation above in tearDown
    }

    public function test_loadAndRegister_binds_a_filter(): void
    {
        $this->directory->write(
            'tweak-content',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Hooks\\RestApi;\nuse Loopress\\Hooks\\Attribute\\Filter;\nfinal class TestLoaderTweakContent\n{\n    #[Filter('the_content')]\n    public function tweak(string \$c): string { return \$c; }\n}\n",
        );

        Functions\expect('add_filter')->once()->with('the_content', \Mockery::type(\Closure::class), 10, 1);
        Functions\when('update_option')->justReturn(true);

        $loader = new HookLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the expectation above in tearDown
    }

    public function test_loadAndRegister_schedules_a_cron_job(): void
    {
        $this->directory->write(
            'cleanup',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Hooks\\RestApi;\nuse Loopress\\Hooks\\Attribute\\Cron;\nfinal class TestLoaderCleanup\n{\n    #[Cron('hourly')]\n    public function run(): void {}\n}\n",
        );

        Functions\expect('add_action')->once()->with('loopress_hooks_cron_cleanup_run', \Mockery::type(\Closure::class));
        Functions\expect('wp_next_scheduled')->once()->with('loopress_hooks_cron_cleanup_run')->andReturn(false);
        Functions\expect('wp_schedule_event')->once()->with(\Mockery::type('int'), 'hourly', 'loopress_hooks_cron_cleanup_run')->andReturn(true);
        Functions\when('update_option')->justReturn(true);

        $loader = new HookLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the expectations above in tearDown
    }

    public function test_loadAndRegister_does_not_reschedule_an_already_scheduled_cron_job(): void
    {
        $this->directory->write(
            'cleanup',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Hooks\\RestApi;\nuse Loopress\\Hooks\\Attribute\\Cron;\nfinal class TestLoaderCleanupScheduled\n{\n    #[Cron('daily')]\n    public function run(): void {}\n}\n",
        );

        Functions\when('add_action')->justReturn(true);
        Functions\when('wp_next_scheduled')->justReturn(12345);
        Functions\expect('wp_schedule_event')->never();
        Functions\when('update_option')->justReturn(true);

        $loader = new HookLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies wp_schedule_event was never called in tearDown
    }

    public function test_loadAndRegister_fails_a_file_with_no_hook_methods(): void
    {
        $this->directory->write(
            'plain',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Hooks\\RestApi;\nfinal class TestLoaderPlain\n{\n    public function notAHook(): void {}\n}\n",
        );

        Functions\expect('update_option')
            ->once()
            ->with(HooksDirectory::LOAD_ERRORS_OPTION, ['plain' => 'no public #[Action], #[Filter], or #[Cron] method found, nothing registered'], false)
            ->andReturn(true);

        $loader = new HookLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the expectation above in tearDown
    }

    public function test_loadAndRegister_skips_a_file_with_more_than_one_class(): void
    {
        $this->directory->write(
            'two-classes',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Hooks\\RestApi;\nuse Loopress\\Hooks\\Attribute\\Action;\nfinal class TestLoaderTwoA { #[Action('init')] public function run(): void {} }\nfinal class TestLoaderTwoB {}\n",
        );

        Functions\expect('add_action')->never();
        Functions\expect('update_option')
            ->once()
            ->with(HooksDirectory::LOAD_ERRORS_OPTION, $this->arrayHasKey('two-classes'), false)
            ->andReturn(true);

        $loader = new HookLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the expectations above in tearDown
    }

    public function test_loadAndRegister_skips_a_class_name_collision_without_registering_anything(): void
    {
        // TestHookLoaderCollisionFixture (global namespace) is already declared by the
        // require_once at the top of this file, standing in for "already loaded by WP core,
        // another plugin, or another hooks/ file this same request".
        $this->directory->write(
            'colliding',
            "<?php\nuse Loopress\\Hooks\\Attribute\\Action;\nfinal class TestHookLoaderCollisionFixture { #[Action('init')] public function run(): void {} }\n",
        );

        Functions\expect('add_action')->never();
        Functions\when('update_option')->justReturn(true);

        $loader = new HookLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies add_action was never called in tearDown
    }
}
