<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\Api\RestApi\RouteLoader;
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
        $loader = new RouteLoader($this->directory);

        $endpoints = $loader->endpointsFor(new RouteLoaderTestFixtureGet());

        $this->assertCount(1, $endpoints);
        $this->assertSame('GET', $endpoints[0]['methods']);
    }

    public function test_endpointsFor_ignores_a_private_method_with_a_verb_name(): void
    {
        // RouteLoaderTestFixtureGet declares a *private* post(): must not be registered,
        // method_exists() alone would incorrectly say yes.
        $loader = new RouteLoader($this->directory);

        $endpoints = $loader->endpointsFor(new RouteLoaderTestFixtureGet());

        $methods = array_column($endpoints, 'methods');
        $this->assertNotContains('POST', $methods);
    }

    public function test_endpointsFor_returns_empty_array_when_no_verb_is_implemented(): void
    {
        $loader = new RouteLoader($this->directory);

        $this->assertSame([], $loader->endpointsFor(new RouteLoaderTestFixtureNoVerbs()));
    }

    public function test_endpointsFor_uses_the_files_permission_override_when_present(): void
    {
        $loader   = new RouteLoader($this->directory);
        $instance = new RouteLoaderTestFixtureWithOverrides();

        $endpoints = $loader->endpointsFor($instance);

        // permission() returns a fresh closure on every call, so identity can't be compared
        // directly; assert the override actually took effect by invoking it.
        $this->assertTrue(($endpoints[0]['permission_callback'])());
    }

    public function test_hasPublicMethod_is_false_for_a_private_method(): void
    {
        $loader = new RouteLoader($this->directory);

        $this->assertFalse($loader->hasPublicMethod(new RouteLoaderTestFixtureGet(), 'post'));
    }

    public function test_hasPublicMethod_is_true_for_a_public_method(): void
    {
        $loader = new RouteLoader($this->directory);

        $this->assertTrue($loader->hasPublicMethod(new RouteLoaderTestFixtureGet(), 'get'));
    }

    // ── loadAndRegister: failure paths never fatal the request ──────────────

    public function test_loadAndRegister_skips_a_class_name_collision_without_registering_anything(): void
    {
        // TestLoaderCollisionFixture is already declared at the top of this file, simulating
        // a collision with WP core, another plugin, or another api/ file (see obsidian doc
        // "Collision de nom de classe"). The written content is never actually required.
        $this->directory->write('test-loader-collision-fixture', '<?php // never actually required');

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);

        $loader = new RouteLoader($this->directory);
        $loader->loadAndRegister();

        $this->assertTrue(true); // reaching this line means it didn't fatal
    }

    public function test_loadAndRegister_skips_a_file_with_a_php_parse_error(): void
    {
        $this->directory->write('test-loader-broken', "<?php\nfinal class TestLoaderBroken\n{\n    public function get( {\n"); // missing closing paren

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);

        $loader = new RouteLoader($this->directory);
        $loader->loadAndRegister();

        $this->assertTrue(true); // reaching this line means the ParseError was caught, not fatal
    }

    public function test_loadAndRegister_registers_a_route_for_a_valid_file(): void
    {
        $this->directory->write('test-loader-valid', "<?php\nfinal class TestLoaderValid\n{\n    public function get(): array\n    {\n        return ['ok' => true];\n    }\n}\n");

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                RouteLoader::NAMESPACE,
                '/test-loader-valid',
                \Mockery::type('array'),
            )
            ->andReturn(true);
        Functions\when('add_filter')->justReturn(true);

        $loader = new RouteLoader($this->directory);
        $loader->loadAndRegister();

        $this->assertTrue(true); // Mockery verifies the register_rest_route expectation in tearDown
    }

    public function test_loadAndRegister_skips_a_file_with_no_public_verb_method(): void
    {
        $this->directory->write('test-loader-no-verbs', "<?php\nfinal class TestLoaderNoVerbs\n{\n    public function notAVerb(): void {}\n}\n");

        Functions\expect('register_rest_route')->never();
        Functions\when('add_filter')->justReturn(true);

        $loader = new RouteLoader($this->directory);
        $loader->loadAndRegister();

        $this->assertTrue(true);
    }

    // ── applyHeaders ─────────────────────────────────────────────────────────

    public function test_applyHeaders_ignores_requests_to_unrelated_routes(): void
    {
        $loader  = new RouteLoader($this->directory);
        $request = new WP_REST_Request([], '/wp/v2/posts');

        $served = $loader->applyHeaders(true, null, $request);

        $this->assertTrue($served);
    }
}
