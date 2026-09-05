<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Api\ApiNamespace;
use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\Api\RestApi\RouteLoader;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

// A global-namespace class (see TestLoaderCollisionFixtureClass.php), can't be PSR-4
// autoloaded: required explicitly so it already exists by the time
// test_loadAndRegister_skips_a_class_name_collision_without_registering_anything runs.
require_once __DIR__ . '/TestLoaderCollisionFixtureClass.php';

class RouteLoaderTest extends TestCase
{
    private string $tmpDir;
    private ApiDirectory $directory;
    private LoopressEnvironment&MockObject $environment;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->tmpDir = sys_get_temp_dir() . '/loopress-route-loader-test-' . uniqid();
        mkdir($this->tmpDir, 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
        if (!defined('WP_CONTENT_DIR')) {
            define('WP_CONTENT_DIR', $this->tmpDir);
        }

        $this->directory = new ApiDirectory();
        // No user vendor/ by default: only the autoload-specific tests below override this.
        $this->environment = $this->createMock(LoopressEnvironment::class);
        $this->environment->method('getAutoloadPath')->willReturn(null);
        Functions\when('get_option')->justReturn(ApiNamespace::DEFAULT);
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

    // ── endpointsFor / hasPublicMethod (pure logic, no I/O) ─────────────────

    public function test_endpointsFor_only_includes_publicly_implemented_verbs(): void
    {
        $loader = new RouteLoader($this->directory, $this->environment);

        $endpoints = $loader->endpointsFor(new RouteLoaderTestFixtureGet());

        $this->assertCount(1, $endpoints);
        $this->assertSame('GET', $endpoints[0]['methods']);
    }

    public function test_endpointsFor_ignores_a_private_method_with_a_verb_name(): void
    {
        // RouteLoaderTestFixtureGet declares a *private* post(): must not be registered,
        // method_exists() alone would incorrectly say yes.
        $loader = new RouteLoader($this->directory, $this->environment);

        $endpoints = $loader->endpointsFor(new RouteLoaderTestFixtureGet());

        $methods = array_column($endpoints, 'methods');
        $this->assertNotContains('POST', $methods);
    }

    public function test_endpointsFor_returns_empty_array_when_no_verb_is_implemented(): void
    {
        $loader = new RouteLoader($this->directory, $this->environment);

        $this->assertSame([], $loader->endpointsFor(new RouteLoaderTestFixtureNoVerbs()));
    }

    public function test_endpointsFor_uses_the_files_permission_override_when_present(): void
    {
        $loader   = new RouteLoader($this->directory, $this->environment);
        $instance = new RouteLoaderTestFixtureWithOverrides();

        $endpoints = $loader->endpointsFor($instance);

        // permission_callback is now a wrapper closure around the file's permission()
        // reference (see wrapPermission()), not permission()'s own return value: invoke it
        // with a request, same shape WP itself calls it with at dispatch.
        $this->assertTrue(($endpoints[0]['permission_callback'])(new WP_REST_Request([], '/test')));
    }

    public function test_endpointsFor_denies_the_pre_direct_callback_permission_convention_instead_of_granting_it(): void
    {
        // Regression for the QA 7th-pass CRITICAL finding: permission() returning a callable
        // (the convention before api-permission-direct-callback) must fail closed, not pass
        // through as truthy just because it's non-null and non-false.
        $loader    = new RouteLoader($this->directory, $this->environment);
        $instance  = new RouteLoaderTestFixtureOldStylePermission();
        $endpoints = $loader->endpointsFor($instance);

        $this->assertFalse(($endpoints[0]['permission_callback'])(new WP_REST_Request([], '/test')));
    }

    public function test_endpointsFor_wraps_a_throwing_permission_to_fail_closed(): void
    {
        // permission() now runs lazily at dispatch (wrapPermission()), not eagerly at
        // registration inside loadFile()'s try/catch: an uncaught throw here would fatal a
        // real request, so the wrapper must catch it and deny instead, same principle
        // applyHeaders() already applies to a throwing headers().
        $loader    = new RouteLoader($this->directory, $this->environment);
        $instance  = new RouteLoaderTestFixtureThrowingPermission();
        $endpoints = $loader->endpointsFor($instance);

        $this->assertFalse(($endpoints[0]['permission_callback'])(new WP_REST_Request([], '/test')));
    }

    public function test_endpointsFor_resolves_permission_per_verb_from_method_level_attributes(): void
    {
        $loader    = new RouteLoader($this->directory, $this->environment);
        $endpoints = $loader->endpointsFor(new RouteLoaderTestFixturePermissionAttributePerVerb());

        $request = new WP_REST_Request([], '/test');

        // get() is public via its own attribute.
        $this->assertTrue(($endpoints[0]['permission_callback'])($request));

        // post() requires a different capability than get()'s attribute, proving each verb
        // resolved its own attribute rather than sharing one.
        Functions\expect('current_user_can')->once()->with('edit_posts')->andReturn(false);
        $this->assertFalse(($endpoints[1]['permission_callback'])($request));
    }

    public function test_endpointsFor_uses_the_class_level_permission_attribute_for_every_verb_without_its_own(): void
    {
        $loader    = new RouteLoader($this->directory, $this->environment);
        $endpoints = $loader->endpointsFor(new RouteLoaderTestFixturePermissionAttributeClassLevel());

        $request = new WP_REST_Request([], '/test');

        $this->assertTrue(($endpoints[0]['permission_callback'])($request)); // the get() endpoint
        $this->assertTrue(($endpoints[1]['permission_callback'])($request)); // the post() endpoint
    }

    public function test_endpointsFor_lets_a_method_level_permission_attribute_override_the_class_level_one(): void
    {
        $loader    = new RouteLoader($this->directory, $this->environment);
        $endpoints = $loader->endpointsFor(new RouteLoaderTestFixturePermissionAttributeMethodOverridesClass());

        $request = new WP_REST_Request([], '/test');

        // get() has its own #[Permission(public: true)]: overrides the class-level
        // capability check, current_user_can() must never be called for this verb (no stub
        // set up for it here, an unstubbed WP function call would error).
        $this->assertTrue(($endpoints[0]['permission_callback'])($request));

        // post() has no method-level attribute: inherits the class-level
        // #[Permission(capability: 'edit_posts')].
        Functions\expect('current_user_can')->once()->with('edit_posts')->andReturn(false);
        $this->assertFalse(($endpoints[1]['permission_callback'])($request));
    }

    public function test_endpointsFor_uses_a_shared_static_method_as_the_permission_callback(): void
    {
        $loader    = new RouteLoader($this->directory, $this->environment);
        $endpoints = $loader->endpointsFor(new RouteLoaderTestFixturePermissionAttributeSharedCallback());
        $callback  = $endpoints[0]['permission_callback'];

        $authorized = new WP_REST_Request(['api_key' => 'secret'], '/test');
        $this->assertTrue($callback($authorized));

        $unauthorized = new WP_REST_Request([], '/test');
        $this->assertFalse($callback($unauthorized));
    }

    public function test_hasPublicMethod_is_false_for_a_private_method(): void
    {
        $loader = new RouteLoader($this->directory, $this->environment);

        $this->assertFalse($loader->hasPublicMethod(new RouteLoaderTestFixtureGet(), 'post'));
    }

    public function test_hasPublicMethod_is_true_for_a_public_method(): void
    {
        $loader = new RouteLoader($this->directory, $this->environment);

        $this->assertTrue($loader->hasPublicMethod(new RouteLoaderTestFixtureGet(), 'get'));
    }

    // ── loadAndRegister: failure paths never fatal the request ──────────────

    public function test_loadAndRegister_skips_a_class_name_collision_without_registering_anything(): void
    {
        // TestLoaderCollisionFixture is already declared at the top of this file, simulating
        // a collision with WP core, another plugin, or another api/ file. Unlike the old
        // path-derived convention, the collision is now only detectable by reading what the
        // file itself declares, so the written content has to actually declare it, under an
        // otherwise unrelated filename, proving the check no longer depends on naming.
        $this->directory->write('anything', "<?php\nfinal class TestLoaderCollisionFixture\n{\n    public function get(): array { return []; }\n}\n");

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // reaching this line means it didn't fatal
    }

    public function test_loadAndRegister_skips_the_second_of_two_files_declaring_the_same_class(): void
    {
        // A gap the old convention couldn't produce a test for: two different slugs always
        // computed two different class names, so this collision (two api/ files agreeing, by
        // mistake, on the same real class name) could never be reached under it. Which of the
        // two loads first isn't guaranteed by directory iteration order, so this only asserts
        // exactly one registration happens and nothing fatals, not which file "won".
        $this->directory->write('first', "<?php\nfinal class DuplicateClassName\n{\n    public function get(): array { return []; }\n}\n");
        $this->directory->write('second', "<?php\nfinal class DuplicateClassName\n{\n    public function get(): array { return []; }\n}\n");

        Functions\expect('register_rest_route')->once()->andReturn(true);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // reaching this line means the second file was skipped, not fatal
    }

    public function test_loadAndRegister_skips_a_file_declaring_no_class(): void
    {
        $this->directory->write('test-loader-empty', "<?php\nfunction not_a_class(): void {}\n");

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true);
    }

    public function test_loadAndRegister_skips_a_file_declaring_more_than_one_class(): void
    {
        $this->directory->write(
            'test-loader-two-classes',
            "<?php\nfinal class TestLoaderFirst\n{\n    public function get(): array { return []; }\n}\nfinal class TestLoaderSecond\n{\n}\n",
        );

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true);
    }

    public function test_loadAndRegister_registers_a_route_for_a_class_named_nothing_like_its_filename(): void
    {
        // The whole point of the tokenizer-based discovery: no formula ties the filename to
        // the class name anymore, so an arbitrarily named class must work exactly the same as
        // one that happens to follow the old convention.
        $this->directory->write('totally-unrelated-slug', "<?php\nfinal class WhateverIWant\n{\n    public function get(): array { return []; }\n}\n");

        Functions\expect('register_rest_route')
            ->once()
            ->with(ApiNamespace::DEFAULT, '/totally\-unrelated\-slug', \Mockery::type('array'))
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_registers_a_namespaced_class(): void
    {
        $this->directory->write(
            'test-loader-namespaced',
            "<?php\nnamespace Loopress\\Tests\\Fixtures;\nfinal class TestLoaderNamespaced\n{\n    public function get(): array { return []; }\n}\n",
        );

        Functions\expect('register_rest_route')
            ->once()
            ->with(ApiNamespace::DEFAULT, '/test\-loader\-namespaced', \Mockery::type('array'))
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_ignores_a_class_constant_reference_when_counting_declarations(): void
    {
        // `Foo::class` tokenizes the `class` keyword the same way a real declaration does;
        // without excluding it, this file would look like it declares two classes and get
        // skipped instead of registered.
        $this->directory->write(
            'test-loader-class-constant',
            "<?php\nfinal class TestLoaderClassConstant\n{\n    public function get(): array\n    {\n        return ['self' => self::class];\n    }\n}\n",
        );

        Functions\expect('register_rest_route')
            ->once()
            ->with(ApiNamespace::DEFAULT, '/test\-loader\-class\-constant', \Mockery::type('array'))
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_skips_a_file_with_a_php_parse_error(): void
    {
        $this->directory->write('test-loader-broken', "<?php\nfinal class TestLoaderBroken\n{\n    public function get( {\n"); // missing closing paren

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // reaching this line means the ParseError was caught, not fatal
    }

    public function test_loadAndRegister_registers_a_route_for_a_valid_file(): void
    {
        $this->directory->write('test-loader-valid', "<?php\nfinal class TestLoaderValid\n{\n    public function get(): array\n    {\n        return ['ok' => true];\n    }\n}\n");

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                ApiNamespace::DEFAULT,
                // preg_quote() escapes every special char of a plain kebab-case segment,
                // including '-': functionally identical to the unescaped route (a literal
                // hyphen matches the same either way), but the registered string now differs.
                '/test\-loader\-valid',
                \Mockery::type('array'),
            )
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_registers_a_regex_route_for_a_file_with_a_dynamic_segment(): void
    {
        $this->directory->write(
            'invoice-pdf/[order_id]',
            "<?php\nfinal class InvoicePdf_OrderId\n{\n    public function get(WP_REST_Request \$request): array\n    {\n        return ['order_id' => \$request->get_param('order_id')];\n    }\n}\n",
        );

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                ApiNamespace::DEFAULT,
                '/invoice\-pdf/(?P<order_id>[^/]+)',
                \Mockery::type('array'),
            )
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_registers_a_route_with_multiple_dynamic_segments(): void
    {
        $this->directory->write(
            'orders/[order_id]/items/[item_id]',
            "<?php\nfinal class Orders_OrderId_Items_ItemId\n{\n    public function get(): array { return []; }\n}\n",
        );

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                ApiNamespace::DEFAULT,
                '/orders/(?P<order_id>[^/]+)/items/(?P<item_id>[^/]+)',
                \Mockery::type('array'),
            )
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_registers_a_route_even_though_its_permission_would_throw(): void
    {
        // permission() now runs lazily at dispatch (see endpointsFor()'s wrapPermission()),
        // not eagerly at registration: unlike a parse error or a class name collision, a
        // file whose permission() would throw still registers normally. The fail-closed
        // behaviour of the wrapped callback itself is covered separately by
        // test_endpointsFor_wraps_a_throwing_permission_to_fail_closed.
        $this->directory->write(
            'test-loader-throws-permission',
            "<?php\nfinal class TestLoaderThrowsPermission\n{\n    public function get(): array { return []; }\n    public function permission(\\WP_REST_Request \$request): bool { throw new \\RuntimeException('boom'); }\n}\n",
        );

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                ApiNamespace::DEFAULT,
                '/test\-loader\-throws\-permission',
                \Mockery::type('array'),
            )
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_recreates_the_anti_listing_index_file_if_missing(): void
    {
        // Simulates a Git-based deploy that never went through lps api push (the only channel
        // that used to create it): loadAndRegister() must self-heal it on every boot instead
        // of only when a push happens to write a file.
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertFileExists(WP_CONTENT_DIR . '/loopress/api/index.php');
    }

    public function test_loadAndRegister_registers_a_route_for_a_file_missing_the_abspath_guard(): void
    {
        // The source-controlled version of every api/ file never has the guard (lps api pull
        // strips it, see FileWriter::stripGuard()), so a file deployed by any channel other
        // than lps api push arrives here without it. Must still register normally, only be
        // logged, never blocked.
        $this->directory->write(
            'test-loader-no-guard',
            "<?php\nfinal class TestLoaderNoGuard\n{\n    public function get(): array { return []; }\n}\n",
        );

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                ApiNamespace::DEFAULT,
                '/test\-loader\-no\-guard',
                \Mockery::type('array'),
            )
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_skips_a_file_with_no_public_verb_method(): void
    {
        $this->directory->write('test-loader-no-verbs', "<?php\nfinal class TestLoaderNoVerbs\n{\n    public function notAVerb(): void {}\n}\n");

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true);
    }

    // ── loadAndRegister: boot-time load-error reporting (US-5) ──────────────

    public function test_loadAndRegister_records_a_load_failure_in_the_option_keyed_by_slug(): void
    {
        $this->directory->write('test-loader-empty', "<?php\nfunction not_a_class(): void {}\n");

        Functions\when('add_filter')->justReturn(true);
        Functions\expect('update_option')
            ->once()
            ->with(
                ApiDirectory::LOAD_ERRORS_OPTION,
                \Mockery::on(static fn (mixed $errors): bool => is_array($errors)
                    && array_key_exists('test-loader-empty', $errors)
                    && is_string($errors['test-loader-empty'])),
                false,
            )
            ->andReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the update_option expectation in tearDown
    }

    public function test_loadAndRegister_writes_an_empty_option_when_every_file_loads_cleanly(): void
    {
        $this->directory->write('test-loader-clean', "<?php\nfinal class TestLoaderClean\n{\n    public function get(): array { return []; }\n}\n");

        Functions\when('add_filter')->justReturn(true);
        Functions\when('register_rest_route')->justReturn(true);
        Functions\expect('update_option')->once()->with(ApiDirectory::LOAD_ERRORS_OPTION, [], false)->andReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the update_option expectation in tearDown
    }

    // ── loadAndRegister: user vendor autoload ────────────────────────────────

    public function test_loadAndRegister_does_nothing_when_the_user_has_no_vendor_autoload(): void
    {
        // Default setUp() stub already returns null; this test documents that explicitly
        // rather than relying on it silently.
        $this->environment->method('getAutoloadPath')->willReturn(null);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // reaching this line means no attempt was made to require anything
    }

    public function test_loadAndRegister_requires_the_users_own_vendor_autoload_when_present(): void
    {
        $autoloadPath = $this->tmpDir . '/user-vendor-autoload.php';
        file_put_contents( // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
            $autoloadPath,
            "<?php\nfunction loopress_test_user_vendor_autoload_marker(): bool { return true; }\n",
        );

        $environment = $this->createMock(LoopressEnvironment::class);
        $environment->method('getAutoloadPath')->willReturn($autoloadPath);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $environment);
        $loader->loadAndRegister();

        $this->assertTrue(function_exists('loopress_test_user_vendor_autoload_marker'));
    }

    public function test_loadAndRegister_survives_a_broken_user_vendor_autoload(): void
    {
        $autoloadPath = $this->tmpDir . '/broken-vendor-autoload.php';
        file_put_contents($autoloadPath, "<?php\nfinal class LoopressTestBrokenVendorAutoload\n{\n    public function get( {\n"); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- missing closing paren

        $environment = $this->createMock(LoopressEnvironment::class);
        $environment->method('getAutoloadPath')->willReturn($autoloadPath);
        Functions\when('add_filter')->justReturn(true);
        // loadAndRegister() always writes the load-errors option at the end of its pass (see
        // US-5); dedicated assertions on its content live in their own tests further below.
        Functions\when('update_option')->justReturn(true);

        $loader = new RouteLoader($this->directory, $environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // reaching this line means the ParseError was caught, not fatal
    }

    // ── registerCronJobs ─────────────────────────────────────────────────────

    public function test_registerCronJobs_binds_and_schedules_a_cron_method(): void
    {
        $this->directory->write(
            'test-loader-cron-only',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Api\\RestApi;\nuse Loopress\\Api\\Attribute\\Cron;\nfinal class TestLoaderCronOnly\n{\n    #[Cron('hourly')]\n    public function cleanup(): void {}\n}\n",
        );

        Functions\expect('add_action')->once()->with('loopress_api_cron_test-loader-cron-only_cleanup', \Mockery::type(\Closure::class));
        Functions\expect('wp_next_scheduled')->once()->with('loopress_api_cron_test-loader-cron-only_cleanup')->andReturn(false);
        Functions\expect('wp_schedule_event')->once()->with(\Mockery::type('int'), 'hourly', 'loopress_api_cron_test-loader-cron-only_cleanup')->andReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->registerCronJobs();

        $this->assertTrue(true); // Mockery verifies the expectations above in tearDown
    }

    public function test_registerCronJobs_does_not_reschedule_an_already_scheduled_event(): void
    {
        $this->directory->write(
            'test-loader-cron-scheduled',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Api\\RestApi;\nuse Loopress\\Api\\Attribute\\Cron;\nfinal class TestLoaderCronScheduled\n{\n    #[Cron('daily')]\n    public function cleanup(): void {}\n}\n",
        );

        Functions\when('add_action')->justReturn(true);
        Functions\when('wp_next_scheduled')->justReturn(12345);
        Functions\expect('wp_schedule_event')->never();

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->registerCronJobs();

        $this->assertTrue(true); // Mockery verifies wp_schedule_event was never called in tearDown
    }

    public function test_registerCronJobs_and_loadAndRegister_share_one_require_of_the_same_file(): void
    {
        // Regression for the resolveInstance() cache: registerCronJobs() (init) and
        // loadAndRegister() (rest_api_init) can both run against the same slug in one request.
        // Without caching, the second pass's own class_exists() check would misread the first
        // pass's require_once as an external collision and skip registering the REST route.
        $this->directory->write(
            'test-loader-cron-and-route',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Api\\RestApi;\nuse Loopress\\Api\\Attribute\\Cron;\nfinal class TestLoaderCronAndRoute\n{\n    public function get(): array { return []; }\n    #[Cron('daily')]\n    public function cleanup(): void {}\n}\n",
        );

        Functions\when('add_action')->justReturn(true);
        Functions\when('wp_next_scheduled')->justReturn(false);
        Functions\when('wp_schedule_event')->justReturn(true);
        Functions\when('add_filter')->justReturn(true);
        Functions\when('update_option')->justReturn(true);
        Functions\expect('register_rest_route')
            ->once()
            ->with(ApiNamespace::DEFAULT, '/test\-loader\-cron\-and\-route', \Mockery::type('array'))
            ->andReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        // 'init' fires before 'rest_api_init' on a real request: same order here.
        $loader->registerCronJobs();
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies register_rest_route was still called once in tearDown
    }

    public function test_loadAndRegister_registers_no_route_but_does_not_fail_a_cron_only_file(): void
    {
        $this->directory->write(
            'test-loader-cron-file-only',
            "<?php\nnamespace Loopress\\Tests\\Unit\\Api\\RestApi;\nuse Loopress\\Api\\Attribute\\Cron;\nfinal class TestLoaderCronFileOnly\n{\n    #[Cron('daily')]\n    public function cleanup(): void {}\n}\n",
        );

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);
        Functions\expect('update_option')->once()->with(ApiDirectory::LOAD_ERRORS_OPTION, [], false)->andReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // no "no public HTTP verb method" failure recorded: update_option got []
    }

    // ── applyHeaders ─────────────────────────────────────────────────────────

    public function test_applyHeaders_ignores_requests_to_unrelated_routes(): void
    {
        $loader  = new RouteLoader($this->directory, $this->environment);
        $request = new WP_REST_Request([], '/wp/v2/posts');

        $served = $loader->applyHeaders(true, null, $request);

        $this->assertTrue($served);
    }

    public function test_applyHeaders_returns_served_unchanged_when_the_files_headers_method_throws(): void
    {
        // applyHeaders() now reads the matched endpoint off $request->get_attributes(), the
        // same place WP core itself puts it during a real dispatch (verified against
        // WP_REST_Server::match_request_to_handler() and rest_handle_options_request()).
        // Simulating that directly here, rather than going through loadAndRegister() +
        // register_rest_route(), which no longer says anything about what a real dispatch
        // would have put on the request.
        $loader    = new RouteLoader($this->directory, $this->environment);
        $endpoints = $loader->endpointsFor(new RouteLoaderTestFixtureThrowingHeaders());

        $request = new WP_REST_Request([], '/test');
        $request->set_attributes($endpoints[0]);

        $served = $loader->applyHeaders(true, null, $request);

        $this->assertTrue($served); // reaching this line means the exception from headers() was caught
    }
}
