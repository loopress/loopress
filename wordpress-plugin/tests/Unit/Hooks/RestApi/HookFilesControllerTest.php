<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Hooks\Infrastructure\HooksDirectory;
use Loopress\Hooks\RestApi\HookFilesController;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class HookFilesControllerTest extends TestCase
{
    private HooksDirectory&MockObject $directory;
    private HookFilesController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->directory = $this->createMock(HooksDirectory::class);
        $this->controller = new HookFilesController($this->directory);
        // list_files() reads HookLoader's boot-time load-error option; no errors by default,
        // overridden per-test below where the error-badge behavior is under test.
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
        $this->assertTrue(HookFilesController::isValidFilename('hello'));
        $this->assertTrue(HookFilesController::isValidFilename('content-filters'));
    }

    public function test_isValidFilename_accepts_a_nested_path(): void
    {
        $this->assertTrue(HookFilesController::isValidFilename('content/filters'));
    }

    public function test_isValidFilename_rejects_path_traversal(): void
    {
        $this->assertFalse(HookFilesController::isValidFilename('../../../wp-config'));
        $this->assertFalse(HookFilesController::isValidFilename('content/..'));
    }

    public function test_isValidFilename_rejects_malformed_input(): void
    {
        $this->assertFalse(HookFilesController::isValidFilename(''));
        $this->assertFalse(HookFilesController::isValidFilename('/leading-slash'));
        $this->assertFalse(HookFilesController::isValidFilename('trailing-slash/'));
        $this->assertFalse(HookFilesController::isValidFilename('double//slash'));
        $this->assertFalse(HookFilesController::isValidFilename('WITH_MAJ_HOOK'));
        $this->assertFalse(HookFilesController::isValidFilename('[bracket]'));
        $this->assertFalse(HookFilesController::isValidFilename(123));
    }

    // Regression: 'index' alone matches FILENAME_PATTERN like any other kebab-case segment,
    // but HooksDirectory::listSlugs() silently excludes any file named index.php (its own
    // anti-listing guard), at any depth. Without this, push_file() would 200 a hook that then
    // never appears in list_files()/listSlugs() and never loads.
    public function test_isValidFilename_rejects_a_filename_whose_last_segment_is_index(): void
    {
        $this->assertFalse(HookFilesController::isValidFilename('index'));
        $this->assertFalse(HookFilesController::isValidFilename('content/index'));
    }

    public function test_isValidFilename_accepts_a_filename_that_merely_contains_index(): void
    {
        $this->assertTrue(HookFilesController::isValidFilename('index-page-hooks'));
        $this->assertTrue(HookFilesController::isValidFilename('index/content-filters'));
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

    // ── push_file ────────────────────────────────────────────────────────────

    public function test_push_file_returns_400_for_a_filename_the_register_routes_validate_callback_would_reject(): void
    {
        $request = new WP_REST_Request(['filename' => '../../../wp-config', 'content' => '<?php']);

        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
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
    }

    public function test_push_file_returns_400_when_content_has_no_declare_strict_types(): void
    {
        $request = new WP_REST_Request(['filename' => 'hello', 'content' => "<?php\nfinal class Hello {}\n"]);

        $this->directory->expects($this->never())->method('write');

        $response = $this->controller->push_file($request);

        $this->assertSame(400, $response->status);
    }

    public function test_push_file_returns_400_when_content_has_invalid_php_syntax(): void
    {
        $request = new WP_REST_Request([
            'filename' => 'broken',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class Broken {\n    public function onInit() {\n        return 1\n    }\n}\n",
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

    public function test_push_file_returns_400_when_the_class_collides_with_another_hooks_file(): void
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
        $content = "<?php\ndeclare(strict_types=1);\nfinal class WP_Post {}\n";
        $request = new WP_REST_Request(['filename' => 'hello', 'content' => $content]);

        $this->directory->method('listSlugs')->willReturn(['hello']);
        $this->directory->method('read')->with('hello')->willReturn($content);
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
}
