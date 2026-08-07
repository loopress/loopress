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

    // ── classNameFor ─────────────────────────────────────────────────────────

    public function test_classNameFor_converts_kebab_case_to_pascal_case(): void
    {
        $this->assertSame('Hello', RouteLoader::classNameFor('hello'));
        $this->assertSame('HelloWorld', RouteLoader::classNameFor('hello-world'));
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
        // a collision with WP core, another plugin, or another api/ file. The written content
        // is never actually required.
        $this->directory->write('test-loader-collision-fixture', '<?php // never actually required');

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // reaching this line means it didn't fatal
    }

    public function test_loadAndRegister_skips_a_file_with_a_php_parse_error(): void
    {
        $this->directory->write('test-loader-broken', "<?php\nfinal class TestLoaderBroken\n{\n    public function get( {\n"); // missing closing paren

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);

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
                '/test-loader-valid',
                \Mockery::type('array'),
            )
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);

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
                '/test-loader-throws-permission',
                \Mockery::type('array'),
            )
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);

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
                '/test-loader-no-guard',
                \Mockery::type('array'),
            )
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_skips_a_file_with_no_public_verb_method(): void
    {
        $this->directory->write('test-loader-no-verbs', "<?php\nfinal class TestLoaderNoVerbs\n{\n    public function notAVerb(): void {}\n}\n");

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $this->assertTrue(true);
    }

    // ── loadAndRegister: user vendor autoload ────────────────────────────────

    public function test_loadAndRegister_does_nothing_when_the_user_has_no_vendor_autoload(): void
    {
        // Default setUp() stub already returns null; this test documents that explicitly
        // rather than relying on it silently.
        $this->environment->method('getAutoloadPath')->willReturn(null);
        Functions\when('add_filter')->justReturn(true);

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

        $loader = new RouteLoader($this->directory, $environment);
        $loader->loadAndRegister();

        $this->assertTrue(true); // reaching this line means the ParseError was caught, not fatal
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
        $this->directory->write(
            'test-loader-throws-headers',
            "<?php\nfinal class TestLoaderThrowsHeaders\n{\n    public function get(): array { return []; }\n    public function headers(): array { throw new \\RuntimeException('boom'); }\n}\n",
        );

        Functions\when('register_rest_route')->justReturn(true);
        Functions\when('add_filter')->justReturn(true);

        $loader = new RouteLoader($this->directory, $this->environment);
        $loader->loadAndRegister();

        $request = new WP_REST_Request([], ApiNamespace::DEFAULT . '/test-loader-throws-headers');

        $served = $loader->applyHeaders(true, null, $request);

        $this->assertTrue($served); // reaching this line means the exception from headers() was caught
    }
}
