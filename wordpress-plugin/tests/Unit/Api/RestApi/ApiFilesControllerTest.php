<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\Api\RestApi\ApiFilesController;
use PHPUnit\Framework\Attributes\DataProvider;
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

    // A content hash of the file's own unguarded bytes (#234), the precondition `api push`
    // reads back as `expectedRevision`. Opaque to callers: only ever asserted for equality
    // here, never for a particular value.
    public function test_list_files_includes_a_revision_field(): void
    {
        $content = "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n";
        $this->directory->method('listSlugs')->willReturn(['hello']);
        $this->directory->method('read')->with('hello')->willReturn($content);

        $response = $this->controller->list_files();

        $this->assertSame(hash('sha256', $content), $response->data[0]['revision']);
    }

    public function test_list_files_gives_two_files_with_identical_content_the_same_revision(): void
    {
        $content = "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n";
        $this->directory->method('listSlugs')->willReturn(['hello', 'hello-again']);
        $this->directory->method('read')->willReturn($content);

        $response = $this->controller->list_files();

        $byName = array_column($response->data, 'revision', 'filename');
        $this->assertSame($byName['hello'], $byName['hello-again']);
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

    // ── expectedRevision (#234) ─────────────────────────────────────────────

    public function test_push_file_returns_a_revision_in_the_success_response(): void
    {
        $content = "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n";
        $request = new WP_REST_Request(['filename' => 'hello', 'content' => $content]);

        $response = $this->controller->push_file($request);

        $this->assertSame(200, $response->status);
        $this->assertSame(hash('sha256', $content), $response->data['revision']);
    }

    public function test_push_file_writes_when_expectedRevision_matches_the_files_current_content(): void
    {
        $current = "<?php\ndeclare(strict_types=1);\nfinal class Hello { public function get(): array { return []; } }\n";
        $new     = "<?php\ndeclare(strict_types=1);\nfinal class Hello { public function get(): array { return ['ok' => true]; } }\n";
        $this->directory->method('read')->with('hello')->willReturn($current);
        $this->directory->expects($this->once())->method('write');

        $request = new WP_REST_Request([
            'filename'         => 'hello',
            'content'          => $new,
            'expectedRevision' => hash('sha256', $current),
        ]);

        $response = $this->controller->push_file($request);

        $this->assertSame(200, $response->status);
    }

    // Three shapes of "the write must be refused, and never reach directory()->write()", the
    // stale-revision (412), missing-file (412), and malformed-type (400) cases, previously three
    // separate but near-identical tests, consolidated to cut the boilerplate CI flagged as
    // duplication (each only differs in the current content, the expectedRevision sent, and the
    // resulting status/error substring).
    /** @return array<string, array{0: string, 1: null|string, 2: mixed, 3: string, 4: int}> */
    public static function rejectedExpectedRevisionCases(): array
    {
        return [
            'stale revision' => [
                "<?php\ndeclare(strict_types=1);\nfinal class Hello { public function get(): array { return []; } }\n",
                "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n",
                'not-the-current-revision',
                'changed on WordPress since it was last read',
                412,
            ],
            // No current content (the file doesn't exist yet) means there was nothing to
            // condition on: an expectedRevision sent for it anyway is a real mismatch, framed
            // the same as options' equivalent ("it no longer exists"), not treated as if no
            // precondition had been given.
            'missing file' => [
                "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n",
                null,
                'some-revision',
                'it no longer exists',
                412,
            ],
            // Unlike 'content' (a wrong type is silently (string)-cast), a malformed
            // expectedRevision must never be silently treated as absent: that would drop the
            // conditional-write precondition entirely, letting a stray non-string value bypass
            // #234's protection outright.
            'non-string revision' => [
                "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n",
                "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n",
                42,
                'expectedRevision',
                400,
            ],
        ];
    }

    #[DataProvider('rejectedExpectedRevisionCases')]
    public function test_push_file_rejects_the_write_when_expectedRevision_does_not_clear(
        string $content,
        ?string $currentContent,
        mixed $expectedRevision,
        string $expectedError,
        int $expectedStatus,
    ): void {
        $this->directory->method('read')->with('hello')->willReturn($currentContent);
        $this->directory->expects($this->never())->method('write');

        $request = new WP_REST_Request(['filename' => 'hello', 'content' => $content, 'expectedRevision' => $expectedRevision]);

        $response = $this->controller->push_file($request);

        $this->assertSame($expectedStatus, $response->status);
        $this->assertStringContainsString($expectedError, (string) $response->data['error']);
    }

    public function test_push_file_writes_without_a_precondition_when_expectedRevision_is_absent(): void
    {
        // Regression guard: the directory's own read() must not even be consulted for the
        // precondition check when no expectedRevision was sent (a first push, an upsert
        // create), only for the pre-existing collision-detection read() call this test doesn't
        // trigger (no other slugs, no previous content under this same filename).
        $this->directory->method('read')->with('hello')->willReturn(null);
        $this->directory->expects($this->once())->method('write');

        $request = new WP_REST_Request([
            'filename' => 'hello',
            'content'  => "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n",
        ]);

        $response = $this->controller->push_file($request);

        $this->assertSame(200, $response->status);
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

    // ── push_batch (#236) ───────────────────────────────────────────────────

    private function validFile(string $filename = 'hello', string $className = 'Hello'): array
    {
        return ['content' => "<?php\ndeclare(strict_types=1);\nfinal class {$className} {}\n", 'filename' => $filename];
    }

    public function test_push_batch_returns_400_when_files_is_missing(): void
    {
        $this->directory->expects($this->never())->method('beginBatch');

        $response = $this->controller->push_batch(new WP_REST_Request([]));

        $this->assertSame(400, $response->status);
    }

    public function test_push_batch_returns_400_when_files_is_empty(): void
    {
        $this->directory->expects($this->never())->method('beginBatch');

        $response = $this->controller->push_batch(new WP_REST_Request(['files' => []]));

        $this->assertSame(400, $response->status);
    }

    public function test_push_batch_returns_400_when_prune_is_present_but_not_an_array(): void
    {
        $this->directory->expects($this->never())->method('beginBatch');

        $response = $this->controller->push_batch(new WP_REST_Request(['files' => [$this->validFile()], 'prune' => 'not-an-array']));

        $this->assertSame(400, $response->status);
    }

    public function test_push_batch_stages_every_file_and_commits_once(): void
    {
        $this->directory->expects($this->once())->method('beginBatch');
        $this->directory->expects($this->exactly(2))->method('stageWrite')
            ->with($this->logicalOr('hello', 'world'), $this->anything());
        $this->directory->expects($this->once())->method('commitBatch');
        $this->directory->expects($this->never())->method('abortBatch');

        $request  = new WP_REST_Request(['files' => [$this->validFile('hello', 'Hello'), $this->validFile('world', 'World')]]);
        $response = $this->controller->push_batch($request);

        $this->assertSame(200, $response->status);
        $this->assertCount(2, $response->data['files']);
        $this->assertSame([], $response->data['pruned']);
    }

    public function test_push_batch_returns_a_revision_for_each_staged_file(): void
    {
        $content = "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n";
        $request = new WP_REST_Request(['files' => [['content' => $content, 'filename' => 'hello']]]);

        $response = $this->controller->push_batch($request);

        $this->assertSame(200, $response->status);
        $this->assertSame(hash('sha256', $content), $response->data['files'][0]['revision']);
    }

    public function test_push_batch_aborts_and_stops_staging_further_files_when_one_fails_validation(): void
    {
        $this->directory->expects($this->once())->method('beginBatch');
        // 'first' declares no class, so this fails before 'second' is ever reached.
        $this->directory->expects($this->never())->method('stageWrite');
        $this->directory->expects($this->once())->method('abortBatch');
        $this->directory->expects($this->never())->method('commitBatch');

        $request = new WP_REST_Request([
            'files' => [
                ['content' => "<?php\nfunction not_a_class(): void {}\n", 'filename' => 'first'],
                $this->validFile('second', 'Second'),
            ],
        ]);
        $response = $this->controller->push_batch($request);

        $this->assertSame(400, $response->status);
    }

    public function test_push_batch_checks_a_collision_against_the_staged_batch_not_just_the_live_directory(): void
    {
        // Two files in the same batch both declaring class Shared: findCollision() must catch
        // this from listStagedSlugs()/readStaged(), the live directory is empty either way.
        $this->directory->method('listStagedSlugs')->willReturnOnConsecutiveCalls([], ['first']);
        $this->directory->method('readStaged')->willReturnMap([
            ['first', "<?php\ndeclare(strict_types=1);\nfinal class Shared {}\n"],
        ]);
        $this->directory->expects($this->once())->method('abortBatch');
        $this->directory->expects($this->never())->method('commitBatch');

        $request = new WP_REST_Request([
            'files' => [
                ['content' => "<?php\ndeclare(strict_types=1);\nfinal class Shared {}\n", 'filename' => 'first'],
                ['content' => "<?php\ndeclare(strict_types=1);\nfinal class Shared {}\n", 'filename' => 'second'],
            ],
        ]);
        $response = $this->controller->push_batch($request);

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('first.php', (string) $response->data['error']);
    }

    public function test_push_batch_returns_400_and_aborts_for_an_invalid_prune_filename(): void
    {
        $this->directory->expects($this->once())->method('stageWrite');
        $this->directory->expects($this->never())->method('stageDelete');
        $this->directory->expects($this->once())->method('abortBatch');
        $this->directory->expects($this->never())->method('commitBatch');

        $request  = new WP_REST_Request(['files' => [$this->validFile()], 'prune' => ['../../wp-config']]);
        $response = $this->controller->push_batch($request);

        $this->assertSame(400, $response->status);
    }

    public function test_push_batch_stages_prune_deletions_and_commits_alongside_the_pushed_files(): void
    {
        $this->directory->expects($this->once())->method('stageWrite')->with('hello', $this->anything());
        $this->directory->expects($this->once())->method('stageDelete')->with('stale');
        $this->directory->expects($this->once())->method('commitBatch');

        $request  = new WP_REST_Request(['files' => [$this->validFile()], 'prune' => ['stale']]);
        $response = $this->controller->push_batch($request);

        $this->assertSame(200, $response->status);
        $this->assertSame(['stale'], $response->data['pruned']);
    }

    public function test_push_batch_clears_stale_load_errors_for_pruned_filenames(): void
    {
        Functions\when('get_option')->justReturn(['other' => 'boom', 'stale' => 'expected exactly one class declaration, found none']);
        Functions\expect('update_option')->once()->with('loopress_api_load_errors', ['other' => 'boom'], false)->andReturn(true);

        $request  = new WP_REST_Request(['files' => [$this->validFile()], 'prune' => ['stale']]);
        $response = $this->controller->push_batch($request);

        $this->assertSame(200, $response->status);
    }

    public function test_push_batch_returns_500_and_aborts_when_commitBatch_fails(): void
    {
        $this->directory->method('commitBatch')->willThrowException(new \RuntimeException('disk full'));
        $this->directory->expects($this->once())->method('abortBatch');

        $request  = new WP_REST_Request(['files' => [$this->validFile()]]);
        $response = $this->controller->push_batch($request);

        $this->assertSame(500, $response->status);
        $this->assertStringContainsString('disk full', (string) $response->data['error']);
    }

    public function test_push_batch_returns_500_when_beginBatch_fails(): void
    {
        $this->directory->method('beginBatch')->willThrowException(new \RuntimeException('cannot prepare staging'));
        $this->directory->expects($this->never())->method('stageWrite');

        $request  = new WP_REST_Request(['files' => [$this->validFile()]]);
        $response = $this->controller->push_batch($request);

        $this->assertSame(500, $response->status);
    }

    public function test_push_batch_returns_400_for_each_entry_missing_filename_or_content(): void
    {
        $this->directory->expects($this->once())->method('abortBatch');

        $request  = new WP_REST_Request(['files' => [['content' => '<?php']]]);
        $response = $this->controller->push_batch($request);

        $this->assertSame(400, $response->status);
    }
}
