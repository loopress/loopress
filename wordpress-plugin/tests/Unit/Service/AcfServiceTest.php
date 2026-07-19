<?php

namespace Loopress\Tests\Unit\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Service\AcfService;
use PHPUnit\Framework\TestCase;
use WP_Post;

class AcfServiceTest extends TestCase
{
    private AcfService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->service = new AcfService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── isActive ─────────────────────────────────────────────────────────────

    public function test_is_not_active_when_acf_functions_are_missing(): void
    {
        // acf_get_internal_post_type_posts() genuinely doesn't exist in the test
        // environment (ACF isn't loaded), so this exercises the real function_exists()
        // check rather than a stub, same convention as CodeSnippetsSnippetProviderTest's
        // isActive() coverage.
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
