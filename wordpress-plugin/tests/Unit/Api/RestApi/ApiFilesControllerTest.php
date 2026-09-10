<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\Api\RestApi\ApiFilesController;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class ApiFilesControllerTest extends TestCase
{
    private ApiDirectory&MockObject $directory;
    private ApiFilesController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->directory = $this->createMock(ApiDirectory::class);
        // Real default cap: an unstubbed mock int-return would be 0 and reject every push.
        $this->directory->method('maxFileBytes')->willReturn(512 * 1024);
        $this->controller = new ApiFilesController($this->directory);
        // list_files() reads RouteLoader's boot-time load-error option (US-5); no errors by
        // default, overridden per-test below where the error-badge behavior is under test.
        Functions\when('get_option')->justReturn([]);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── isValidFilename ──────────────────────────────────────────────────────

    public function test_isValidFilename_accepts_a_plain_kebab_case_name(): void
    {
        $this->assertTrue(ApiFilesController::isValidFilename('hello'));
        $this->assertTrue(ApiFilesController::isValidFilename('hello-world'));
    }

    public function test_isValidFilename_accepts_a_dynamic_segment(): void
    {
        $this->assertTrue(ApiFilesController::isValidFilename('invoice-pdf/[order_id]'));
        $this->assertTrue(ApiFilesController::isValidFilename('orders/[order_id]/items/[item_id]'));
    }

    public function test_isValidFilename_rejects_path_traversal(): void
    {
        $this->assertFalse(ApiFilesController::isValidFilename('../../../wp-config'));
        $this->assertFalse(ApiFilesController::isValidFilename('invoice-pdf/..'));
    }

    public function test_isValidFilename_rejects_malformed_input(): void
    {
        $this->assertFalse(ApiFilesController::isValidFilename(''));
        $this->assertFalse(ApiFilesController::isValidFilename('/leading-slash'));
        $this->assertFalse(ApiFilesController::isValidFilename('trailing-slash/'));
        $this->assertFalse(ApiFilesController::isValidFilename('double//slash'));
        $this->assertFalse(ApiFilesController::isValidFilename('WITH_MAJ_ENDPOINT'));
        $this->assertFalse(ApiFilesController::isValidFilename('[not-a-word-char!]'));
        $this->assertFalse(ApiFilesController::isValidFilename(123));
    }

    // ── list_files ───────────────────────────────────────────────────────────

    public function test_list_files_returns_content_with_the_guard_stripped(): void
    {
        $guarded = "<?php\ndeclare(strict_types=1);\nif (!defined('ABSPATH')) {\n    exit;\n}\nfinal class Hello {}\n";
        $this->directory->method('listSlugs')->willReturn(['hello']);
        $this->directory->method('read')->with('hello')->willReturn($guarded);

        $response = $this->controller->list_files();

        $this->assertSame(200, $response->status);
        $this->assertSame('hello', $response->data[0]['filename']);
        $this->assertStringNotContainsString('ABSPATH', $response->data[0]['content']);
    }

    public function test_list_files_skips_a_slug_whose_file_disappeared(): void
    {
        $this->directory->method('listSlugs')->willReturn(['gone']);
        $this->directory->method('read')->with('gone')->willReturn(null);

        $response = $this->controller->list_files();

        $this->assertSame([], $response->data);
    }

    public function test_list_files_adds_an_error_field_for_a_file_that_failed_to_load_at_boot(): void
    {
        Functions\when('get_option')->justReturn(['broken' => 'expected exactly one class declaration, found none']);
        $this->directory->method('listSlugs')->willReturn(['broken']);
        $this->directory->method('read')->with('broken')->willReturn("<?php\nfunction not_a_class(): void {}\n");

        $response = $this->controller->list_files();

        $this->assertSame('expected exactly one class declaration, found none', $response->data[0]['error']);
    }

    public function test_list_files_omits_the_error_field_for_a_file_absent_from_the_load_errors_option(): void
    {
        Functions\when('get_option')->justReturn(['some-other-file' => 'boom']);
        $this->directory->method('listSlugs')->willReturn(['hello']);
        $this->directory->method('read')->with('hello')->willReturn("<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n");

        $response = $this->controller->list_files();

        $this->assertArrayNotHasKey('error', $response->data[0]);
    }

    public function test_list_files_flags_a_public_route(): void
    {
        $this->directory->method('listSlugs')->willReturn(['open', 'closed']);
        $this->directory->method('read')->willReturnMap([
            ['open', "<?php\ndeclare(strict_types=1);\n#[\\Loopress\\Api\\Attribute\\Permission(public: true)]\nfinal class Open { public function get(): array { return []; } }\n"],
            ['closed', "<?php\ndeclare(strict_types=1);\nfinal class Closed { public function get(): array { return []; } }\n"],
        ]);

        $response = $this->controller->list_files();

        $byName = array_column($response->data, null, 'filename');
        $this->assertTrue($byName['open']['public']);
        $this->assertFalse($byName['closed']['public']);
    }

    // ── push_file ────────────────────────────────────────────────────────────

    public function test_push_file_returns_400_for_a_filename_the_register_routes_validate_callback_would_reject(): void
    {
        // register_routes()'s validate_callback normally rejects this before WP ever calls
        // push_file(), but that's not exercised by a direct call to the controller in these
        // unit tests: this covers the defense-in-depth re-check inside push_file() itself
        // (also what clears the path-injection finding a static analyzer raises otherwise,
        // since the validate_callback wiring elsewhere isn't visible to it).
        $request = new WP_REST_Request(['filename' => '../../../wp-config', 'content' => '<?php']);

        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
    }

    public function test_push_file_returns_413_when_content_exceeds_the_size_cap(): void
    {
        $this->directory = $this->createMock(ApiDirectory::class);
        $this->directory->method('maxFileBytes')->willReturn(100);
        $this->directory->expects($this->never())->method('write');
        $controller = new ApiFilesController($this->directory);

        $request  = new WP_REST_Request(['filename' => 'big', 'content' => str_repeat('x', 200)]);
        $response = $controller->push_file($request);

        $this->assertSame(413, $response->status);
        $this->assertStringContainsString('over the 100 byte limit', $response->data['error']);
    }

    // A 5 MB blob of "//x\n" is valid PHP and would previously reach token_get_all() / `php -l`,
    // where the memory it needs is an uncatchable E_ERROR (500), not a clean rejection (F20).
    public function test_push_file_returns_413_for_pathological_large_content_instead_of_fataling(): void
    {
        $this->directory->expects($this->never())->method('write');

        $request  = new WP_REST_Request(['filename' => 'huge', 'content' => str_repeat("//x\n", 5 * 256 * 1024)]);
        $response = $this->controller->push_file($request);

        $this->assertSame(413, $response->status);
    }

    public function test_push_file_writes_the_guarded_content(): void
    {
        $request = new WP_REST_Request([
            'filename' => 'hello',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n",
        ]);

        $this->directory->expects($this->once())
            ->method('write')
            ->with('hello', $this->stringContains("if (!defined('ABSPATH'))"));

        $response = $this->controller->push_file($request);

        $this->assertSame(200, $response->status);
        $this->assertFalse($response->data['public']);
    }

    public function test_push_file_reports_a_public_route_in_the_response(): void
    {
        $request = new WP_REST_Request([
            'filename' => 'open',
            'content'  => "<?php\ndeclare(strict_types=1);\nuse Loopress\\Api\\Attribute\\Permission;\n#[Permission(public: true)]\nfinal class Open { public function get(): array { return []; } }\n",
        ]);

        $response = $this->controller->push_file($request);

        $this->assertSame(200, $response->status);
        $this->assertTrue($response->data['public']);
    }

    public function test_push_file_returns_400_when_content_has_no_declare_strict_types(): void
    {
        $request = new WP_REST_Request(['filename' => 'hello', 'content' => "<?php\nfinal class Hello {}\n"]);

        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
    }

    // Regression coverage for the bug where a file with valid `declare(strict_types=1);` but
    // otherwise broken PHP syntax was written anyway (push_file only checked for the declare
    // line), and only failed later inside RouteLoader's own rest_api_init try/catch — silently,
    // with `api push` reporting success and `api list` showing the file as present.
    public function test_push_file_returns_400_when_content_has_invalid_php_syntax(): void
    {
        $request = new WP_REST_Request([
            'filename' => 'broken',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class Broken {\n    public function get() {\n        return ['ok' => true]\n    }\n}\n",
        ]);

        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('syntax', strtolower((string) $response->data['error']));
    }

    public function test_push_file_returns_400_when_content_declares_no_class(): void
    {
        $request = new WP_REST_Request([
            'filename' => 'hello',
            'content'  => "<?php\ndeclare(strict_types=1);\nfunction not_a_class(): void {}\n",
        ]);

        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('exactly one class', (string) $response->data['error']);
    }

    public function test_push_file_returns_400_when_content_declares_more_than_one_class(): void
    {
        $request = new WP_REST_Request([
            'filename' => 'hello',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\nfinal class World {}\n",
        ]);

        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('Hello, World', (string) $response->data['error']);
    }

    public function test_push_file_returns_400_when_the_class_collides_with_another_api_file(): void
    {
        $request = new WP_REST_Request([
            'filename' => 'new-file',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class Shared {}\n",
        ]);

        $this->directory->method('listSlugs')->willReturn(['other-file']);
        $this->directory->method('read')->with('other-file')->willReturn(
            "<?php\ndeclare(strict_types=1);\nfinal class Shared {}\n",
        );
        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('other-file.php', (string) $response->data['error']);
    }

    public function test_push_file_returns_400_when_the_class_collides_with_another_api_file_differing_only_by_case(): void
    {
        // PHP resolves class names case-insensitively (a real "Cannot redeclare class" fatal
        // would happen here too), so a collision that only differs by case must be caught the
        // same as an exact match.
        $request = new WP_REST_Request([
            'filename' => 'new-file',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class shared {}\n",
        ]);

        $this->directory->method('listSlugs')->willReturn(['other-file']);
        $this->directory->method('read')->with('other-file')->willReturn(
            "<?php\ndeclare(strict_types=1);\nfinal class Shared {}\n",
        );
        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('other-file.php', (string) $response->data['error']);
    }

    public function test_push_file_returns_400_when_the_class_collides_with_an_already_loaded_class(): void
    {
        // WP_Post is one of the global WP REST stubs already loaded for every test (see
        // tests/Stubs/WpRestStubs.php), standing in for a WP core or third-party plugin class
        // that's already declared by the time this request runs.
        $request = new WP_REST_Request([
            'filename' => 'hello',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class WP_Post {}\n",
        ]);

        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('WordPress core or another plugin', (string) $response->data['error']);
    }

    public function test_push_file_does_not_flag_a_collision_when_repushing_the_same_file_unchanged(): void
    {
        // Regression: RouteLoader already ran earlier in this same request and required every
        // existing api/ file, so class_exists() alone can't tell "this file's own class,
        // already loaded" apart from a genuine third-party collision. Re-pushing a file whose
        // class was already loaded under its own previous content must not false-positive.
        $content = "<?php\ndeclare(strict_types=1);\nfinal class WP_Post {}\n";
        $request = new WP_REST_Request(['filename' => 'hello', 'content' => $content]);

        $this->directory->method('listSlugs')->willReturn(['hello']);
        $this->directory->method('read')->with('hello')->willReturn($content);
        $this->directory->expects($this->once())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(200, $response->status);
    }

    public function test_push_file_does_not_flag_a_collision_when_the_same_file_only_recases_its_class_name(): void
    {
        // Same false-positive risk as the unchanged-repush case above, but triggered by case
        // alone: the file's previous content declared `WP_Post`, already loaded by RouteLoader
        // this same request; a strict, case-sensitive self-exclusion check would fail to
        // recognize `wp_post` as "the same class" and wrongly report a collision.
        $request = new WP_REST_Request([
            'filename' => 'hello',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class wp_post {}\n",
        ]);

        $this->directory->method('listSlugs')->willReturn(['hello']);
        $this->directory->method('read')->with('hello')->willReturn(
            "<?php\ndeclare(strict_types=1);\nfinal class WP_Post {}\n",
        );
        $this->directory->expects($this->once())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(200, $response->status);
    }

    public function test_push_file_returns_500_when_the_directory_write_fails(): void
    {
        $request = new WP_REST_Request([
            'filename' => 'hello',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n",
        ]);

        $this->directory->method('write')->willThrowException(new \RuntimeException('disk full'));

        $response = $this->controller->push_file($request);

        $this->assertSame(500, $response->status);
    }

    // ── delete_file ─────────────────────────────────────────────────────────

    public function test_delete_file_removes_the_file_and_returns_200(): void
    {
        $this->directory->expects($this->once())->method('delete')->with('hello')->willReturn(true);

        $response = $this->controller->delete_file(new WP_REST_Request(['filename' => 'hello']));

        $this->assertSame(200, $response->status);
        $this->assertSame(['filename' => 'hello', 'deleted' => true], $response->data);
    }

    public function test_delete_file_returns_404_when_the_file_is_absent(): void
    {
        $this->directory->method('delete')->with('gone')->willReturn(false);

        $response = $this->controller->delete_file(new WP_REST_Request(['filename' => 'gone']));

        $this->assertSame(404, $response->status);
    }

    public function test_delete_file_returns_400_for_an_invalid_filename_without_touching_the_directory(): void
    {
        $this->directory->expects($this->never())->method('delete');

        $response = $this->controller->delete_file(new WP_REST_Request(['filename' => '../../wp-config']));

        $this->assertSame(400, $response->status);
    }

    public function test_delete_file_clears_a_stale_load_error_entry_for_the_removed_slug(): void
    {
        $this->directory->method('delete')->willReturn(true);
        Functions\when('get_option')->justReturn(['hello' => 'expected exactly one class declaration, found none', 'other' => 'boom']);
        Functions\expect('update_option')
            ->once()
            ->with('loopress_api_load_errors', ['other' => 'boom'], false)
            ->andReturn(true);

        $response = $this->controller->delete_file(new WP_REST_Request(['filename' => 'hello']));

        $this->assertSame(200, $response->status);
    }

    public function test_delete_file_does_not_write_the_option_when_there_is_no_stale_entry(): void
    {
        $this->directory->method('delete')->willReturn(true);
        Functions\when('get_option')->justReturn(['other' => 'boom']);
        Functions\expect('update_option')->never();

        $response = $this->controller->delete_file(new WP_REST_Request(['filename' => 'hello']));

        $this->assertSame(200, $response->status);
    }
}
