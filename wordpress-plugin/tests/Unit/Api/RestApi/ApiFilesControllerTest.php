<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Brain\Monkey;
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
        $this->controller = new ApiFilesController($this->directory);
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

    // ── push_file ────────────────────────────────────────────────────────────

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
