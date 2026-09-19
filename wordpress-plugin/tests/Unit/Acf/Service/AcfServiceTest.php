<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Acf\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Acf\Exception\StaleAcfRevisionException;
use Loopress\Acf\Service\AcfService;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
use WP_Post;

class AcfServiceTest extends TestCase
{
    private AcfService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        // get()'s revision hash goes through wp_json_encode(), unavailable outside a real
        // WordPress load; a plain json_encode() delegate is exactly what it does for the
        // exported arrays reaching it here (see OptionsServiceTest for the same stub).
        Functions\when('wp_json_encode')->alias(static fn (mixed $value): string|false => json_encode($value));
        $this->service = new AcfService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── isActive ─────────────────────────────────────────────────────────────

    #[RunInSeparateProcess]
    public function test_is_not_active_when_acf_functions_are_missing(): void
    {
        // acf_get_internal_post_type_posts() genuinely doesn't exist in the test
        // environment (ACF isn't loaded), so this exercises the real function_exists()
        // check rather than a stub, same convention as CodeSnippetsSnippetProviderTest's
        // isActive() coverage. Runs in its own process: Brain\Monkey's function stubbing
        // is permanent process-wide once used, so another test stubbing this same
        // function first (order is randomized, e.g. by Infection) would otherwise make
        // function_exists() return true here regardless of declaration order.
        $this->assertFalse($this->service->isActive());
    }

    // ── list ──────────────────────────────────────────────────────────────────

    public function test_list_attaches_fields_for_field_groups(): void
    {
        Functions\when('acf_get_internal_post_type_posts')->justReturn([['key' => 'group_1']]);
        Functions\expect('acf_get_fields')->once()->with(['key' => 'group_1'])->andReturn([['key' => 'field_1']]);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        $result = $this->service->list('acf-field-group');

        $this->assertSame([['key' => 'group_1', 'fields' => [['key' => 'field_1']]]], $result);
    }

    public function test_list_does_not_attach_fields_for_non_field_group_types(): void
    {
        Functions\when('acf_get_internal_post_type_posts')->justReturn([['key' => 'post_type_1']]);
        Functions\expect('acf_get_fields')->never();
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        $this->service->list('acf-post-type');
        $this->addToAssertionCount(1);
    }

    // ACF's own acf_get_internal_post_type_posts() already degrades to [] when a type isn't
    // registered (e.g. options pages on ACF Free) — confirmed by reading ACF's source, and by
    // manual verification against a real ACF Free install. This must stay a graceful empty
    // result, not an error, so a multi-type `lps acf pull` doesn't abort entirely just because
    // one type (options pages) isn't available.
    public function test_list_returns_empty_array_when_the_target_type_is_not_registered(): void
    {
        Functions\when('acf_get_internal_post_type_posts')->justReturn([]);

        $this->assertSame([], $this->service->list('acf-ui-options-page'));
    }

    // ── get ───────────────────────────────────────────────────────────────────

    public function test_get_returns_null_when_object_not_found(): void
    {
        Functions\when('acf_get_internal_post_type')->justReturn(false);

        $this->assertNull($this->service->get('acf-taxonomy', 'taxonomy_missing'));
    }

    public function test_get_returns_null_when_the_target_type_is_not_registered(): void
    {
        Functions\when('acf_get_internal_post_type')->justReturn(false);

        $this->assertNull($this->service->get('acf-ui-options-page', 'ui_options_page_1'));
    }

    // ── get: revision (#234) ─────────────────────────────────────────────────

    public function test_get_attaches_a_revision_field(): void
    {
        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'taxonomy_1', 'title' => 'Category']);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        $result = $this->service->get('acf-taxonomy', 'taxonomy_1');

        $this->assertArrayHasKey('revision', $result);
        $this->assertIsString($result['revision']);
    }

    public function test_get_revision_is_stable_for_the_same_exported_content(): void
    {
        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'taxonomy_1', 'title' => 'Category']);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        $first  = $this->service->get('acf-taxonomy', 'taxonomy_1');
        $second = $this->service->get('acf-taxonomy', 'taxonomy_1');

        $this->assertSame($first['revision'], $second['revision']);
    }

    public function test_get_revision_differs_for_different_exported_content(): void
    {
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'taxonomy_1', 'title' => 'Category']);
        $before = $this->service->get('acf-taxonomy', 'taxonomy_1');

        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'taxonomy_1', 'title' => 'Categories']);
        $after = $this->service->get('acf-taxonomy', 'taxonomy_1');

        $this->assertNotSame($before['revision'], $after['revision']);
    }

    // Regression coverage (#234): `modified` is a unix timestamp ACF bumps on every save,
    // already excluded from diffing by the CLI's resource-state.ts (ACF_VOLATILE_KEYS). A
    // revision that covered it would change on every save even when nothing else did, needlessly
    // invalidating an expectedRevision a caller only just read.
    public function test_get_revision_ignores_the_modified_timestamp(): void
    {
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'taxonomy_1', 'title' => 'Category', 'modified' => 1]);
        $before = $this->service->get('acf-taxonomy', 'taxonomy_1');

        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'taxonomy_1', 'title' => 'Category', 'modified' => 2]);
        $after = $this->service->get('acf-taxonomy', 'taxonomy_1');

        $this->assertSame($before['revision'], $after['revision']);
    }

    // ── upsert ────────────────────────────────────────────────────────────────

    public function test_upsert_throws_when_key_is_missing(): void
    {
        Functions\when('acf_get_internal_post_type_instance')->justReturn(true);

        $this->expectException(\RuntimeException::class);
        $this->service->upsert('acf-post-type', ['title' => 'No key']);
    }

    // Unlike list/get/delete, upsert() must actively guard this case: acf_import_internal_post_type()
    // silently returns its input unchanged for an unregistered type instead of failing, so
    // without this check a push against an unavailable type (e.g. options pages on ACF Free)
    // would be reported as a success even though nothing was persisted.
    public function test_upsert_throws_when_the_target_type_is_not_registered(): void
    {
        Functions\when('acf_get_internal_post_type_instance')->justReturn(false);

        $this->expectException(\RuntimeException::class);
        $this->service->upsert('acf-ui-options-page', ['key' => 'ui_options_page_1']);
    }

    // Regression coverage: the message used to claim "ACF PRO may be required for options
    // pages", confirmed wrong during the 5th/6th QA passes (options pages work without PRO on
    // Secure Custom Fields). Pins the corrected wording so it can't silently drift back.
    public function test_upsert_error_message_points_at_acf_add_options_page_not_acf_pro(): void
    {
        Functions\when('acf_get_internal_post_type_instance')->justReturn(false);

        try {
            $this->service->upsert('acf-ui-options-page', ['key' => 'ui_options_page_1']);
            $this->fail('Expected a RuntimeException.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('acf_add_options_page()', $e->getMessage());
            $this->assertStringNotContainsString('PRO', $e->getMessage());
        }
    }

    public function test_upsert_creates_when_no_existing_post_is_found_by_key(): void
    {
        $capturedData = null;

        Functions\when('acf_get_internal_post_type_instance')->justReturn(true);
        Functions\when('acf_get_internal_post_type_post')->justReturn(false);
        Functions\when('acf_import_internal_post_type')->alias(
            function (array $data) use (&$capturedData): array {
                $capturedData = $data;
                return ['key' => 'post_type_new'];
            }
        );
        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'post_type_new']);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        $result = $this->service->upsert('acf-post-type', ['key' => 'post_type_new', 'title' => 'New']);

        $this->assertArrayNotHasKey('ID', $capturedData);
        $this->assertSame('post_type_new', $result['key']);
    }

    public function test_upsert_updates_when_an_existing_post_is_found_by_key(): void
    {
        $existing = new WP_Post();
        $existing->ID = 42;
        $capturedData = null;

        Functions\when('acf_get_internal_post_type_instance')->justReturn(true);
        Functions\when('acf_get_internal_post_type_post')->justReturn($existing);
        Functions\when('acf_import_internal_post_type')->alias(
            function (array $data) use (&$capturedData): array {
                $capturedData = $data;
                return ['key' => 'post_type_existing'];
            }
        );
        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'post_type_existing']);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        $result = $this->service->upsert('acf-post-type', ['key' => 'post_type_existing', 'title' => 'Updated']);

        $this->assertSame(42, $capturedData['ID']);
        $this->assertSame('post_type_existing', $result['key']);
    }

    public function test_upsert_strips_active_content_from_labels_and_field_strings(): void
    {
        $capturedData = null;

        Functions\when('acf_get_internal_post_type_instance')->justReturn(true);
        Functions\when('acf_get_internal_post_type_post')->justReturn(false);
        Functions\when('acf_import_internal_post_type')->alias(
            function (array $data) use (&$capturedData): array {
                $capturedData = $data;
                return ['key' => 'group_x'];
            }
        );
        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'group_x']);
        Functions\when('acf_get_fields')->justReturn([]);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        $this->service->upsert('acf-field-group', [
            'key'    => 'group_x',
            'title'  => 'Group <script>evil()</script>',
            'fields' => [
                ['key' => 'field_1', 'label' => 'Name', 'instructions' => 'Enter <img src=x onerror=alert(1)> your name'],
            ],
        ]);

        $this->assertSame('group_x', $capturedData['key']); // identifier untouched
        $this->assertSame('Group ', $capturedData['title']);
        $this->assertSame('Enter <img src=x> your name', $capturedData['fields'][0]['instructions']);
        $this->assertSame('Name', $capturedData['fields'][0]['label']);
    }

    // ── upsert: conditional write (#234) ────────────────────────────────────

    public function test_upsert_succeeds_when_the_expected_revision_still_matches(): void
    {
        Functions\when('acf_get_internal_post_type_instance')->justReturn(true);
        Functions\when('acf_get_internal_post_type_post')->justReturn(false);
        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'post_type_1', 'title' => 'Current']);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);
        Functions\when('acf_import_internal_post_type')->justReturn(['key' => 'post_type_1']);

        $currentRevision = $this->service->get('acf-post-type', 'post_type_1')['revision'];

        $result = $this->service->upsert('acf-post-type', ['key' => 'post_type_1', 'title' => 'New'], $currentRevision);

        $this->assertSame('post_type_1', $result['key']);
    }

    // Regression coverage (#234): the whole point of the precondition is that a write is
    // refused, not silently applied, once the object no longer holds the content the caller
    // last read.
    public function test_upsert_throws_stale_acf_revision_exception_when_the_object_changed_underneath(): void
    {
        Functions\when('acf_get_internal_post_type_instance')->justReturn(true);
        Functions\when('acf_get_internal_post_type_post')->justReturn(false);
        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'post_type_1', 'title' => 'Someone else already changed this']);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        $this->expectException(StaleAcfRevisionException::class);
        $this->service->upsert('acf-post-type', ['key' => 'post_type_1', 'title' => 'New'], 'a-revision-that-no-longer-matches');
    }

    public function test_upsert_does_not_call_acf_import_internal_post_type_when_the_revision_is_stale(): void
    {
        Functions\when('acf_get_internal_post_type_instance')->justReturn(true);
        Functions\when('acf_get_internal_post_type_post')->justReturn(false);
        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'post_type_1', 'title' => 'Someone else already changed this']);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);
        Functions\expect('acf_import_internal_post_type')->never();

        try {
            $this->service->upsert('acf-post-type', ['key' => 'post_type_1', 'title' => 'New'], 'a-revision-that-no-longer-matches');
        } catch (StaleAcfRevisionException) {
            $this->addToAssertionCount(1);
        }
    }

    // A `key` with no post behind it yet is exactly as much "not the content the caller
    // expected" as one holding different content: a precondition must still refuse the write
    // rather than treat "doesn't exist yet" as an exemption from the check.
    public function test_upsert_throws_stale_acf_revision_exception_when_the_key_does_not_exist_yet(): void
    {
        Functions\when('acf_get_internal_post_type_instance')->justReturn(true);
        Functions\when('acf_get_internal_post_type_post')->justReturn(false);
        Functions\when('acf_get_internal_post_type')->justReturn(false);

        $this->expectException(StaleAcfRevisionException::class);
        $this->service->upsert('acf-post-type', ['key' => 'post_type_new', 'title' => 'New'], 'a-revision-from-when-it-existed');
    }

    public function test_upsert_skips_the_revision_check_entirely_when_none_is_given(): void
    {
        Functions\when('acf_get_internal_post_type_instance')->justReturn(true);
        Functions\when('acf_get_internal_post_type_post')->justReturn(false);
        Functions\when('acf_import_internal_post_type')->justReturn(['key' => 'post_type_1']);
        Functions\when('acf_get_internal_post_type')->justReturn(['key' => 'post_type_1']);
        Functions\when('acf_prepare_internal_post_type_for_export')->returnArg(1);

        $result = $this->service->upsert('acf-post-type', ['key' => 'post_type_1', 'title' => 'New']);

        $this->assertSame('post_type_1', $result['key']);
    }

    // ── delete ────────────────────────────────────────────────────────────────

    public function test_delete_delegates_to_acf_delete_internal_post_type(): void
    {
        Functions\expect('acf_delete_internal_post_type')->once()->with('taxonomy_1', 'acf-taxonomy')->andReturn(true);

        $this->assertTrue($this->service->delete('acf-taxonomy', 'taxonomy_1'));
    }

    public function test_delete_returns_false_when_the_target_type_is_not_registered(): void
    {
        Functions\when('acf_delete_internal_post_type')->justReturn(false);

        $this->assertFalse($this->service->delete('acf-ui-options-page', 'ui_options_page_1'));
    }
}
