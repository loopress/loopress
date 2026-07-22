<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Snippets\Service\WPCodeSnippetProvider;
use PHPUnit\Framework\TestCase;
use WP_Post;

class WPCodeSnippetProviderTest extends TestCase
{
    private WPCodeSnippetProvider $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->service = new WPCodeSnippetProvider();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── saveMeta (via updateSnippet) ─────────────────────────────────────────
    // Regression coverage for the bug where an update that omitted `type`
    // silently reset the stored snippet type back to 'php'.
    //
    // WPCode itself stores the code type as a term of its `wpcode_type` taxonomy
    // (not post meta) — see WPCode_Snippet::save()/get_code_type() in the real
    // plugin. Writing to post meta instead means WPCode's own admin UI never
    // sees the value. Location, priority, insert method and shortcode attributes
    // follow the same principle: they must land in the same storage WPCode's own
    // admin UI reads from.

    public function test_update_snippet_does_not_touch_type_taxonomy_when_type_is_omitted(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('wp_set_post_terms')->never();

        $this->service->updateSnippet(6, ['name' => 'New title']);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_writes_type_taxonomy_when_type_is_present(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('wp_set_post_terms')
            ->once()
            ->with(6, ['text'], 'wpcode_type');

        $this->service->updateSnippet(6, ['type' => 'text']);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_writes_location_taxonomy_when_location_is_present(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('wp_set_post_terms')
            ->once()
            ->with(6, ['site_wide_footer'], 'wpcode_location');

        $this->service->updateSnippet(6, ['location' => 'footer']);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_throws_when_location_is_php_only_but_type_is_not_php(): void
    {
        $this->stubExistingSnippet(6, typeTerms: ['css']);

        $this->expectException(\RuntimeException::class);

        $this->service->updateSnippet(6, ['location' => 'admin']);
    }

    public function test_update_snippet_accepts_universal_location_for_any_type(): void
    {
        $this->stubExistingSnippet(6, typeTerms: ['css']);

        Functions\expect('wp_set_post_terms')
            ->once()
            ->with(6, ['site_wide_header'], 'wpcode_location');

        $this->service->updateSnippet(6, ['location' => 'header']);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_does_not_touch_note_meta_when_note_is_omitted(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('update_post_meta')->never();

        $this->service->updateSnippet(6, ['name' => 'New title']);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_sets_auto_insert_meta_to_zero_for_shortcode_insert_method(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('update_post_meta')
            ->once()
            ->with(6, '_wpcode_auto_insert', 0);

        $this->service->updateSnippet(6, ['insertMethod' => 'shortcode']);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_sets_auto_insert_meta_to_one_for_auto_insert_method(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('update_post_meta')
            ->once()
            ->with(6, '_wpcode_auto_insert', 1);

        $this->service->updateSnippet(6, ['insertMethod' => 'auto']);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_writes_priority_meta_when_present(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('update_post_meta')
            ->once()
            ->with(6, '_wpcode_priority', 20);

        $this->service->updateSnippet(6, ['priority' => 20]);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_sanitizes_and_writes_shortcode_attributes(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('update_post_meta')
            ->once()
            ->with(6, '_wpcode_shortcode_attributes', ['color', 'size']);

        $this->service->updateSnippet(6, ['shortcodeAttributes' => ['color', 'size']]);
        $this->addToAssertionCount(1);
    }

    // ── normalize (via getSnippet) ────────────────────────────────────────────

    public function test_get_snippet_reports_the_stored_type(): void
    {
        $this->stubExistingSnippet(6, typeTerms: ['text']);

        $result = $this->service->getSnippet(6);

        $this->assertSame('text', $result['type']);
    }

    public function test_get_snippet_falls_back_to_php_only_when_no_type_term_is_set(): void
    {
        $this->stubExistingSnippet(6, typeTerms: []);

        $result = $this->service->getSnippet(6);

        $this->assertSame('php', $result['type']);
    }

    public function test_get_snippet_reports_the_stored_location_as_canonical_value(): void
    {
        $this->stubExistingSnippet(6, locationTerms: ['site_wide_header']);

        $result = $this->service->getSnippet(6);

        $this->assertSame('header', $result['location']);
    }

    public function test_get_snippet_falls_back_to_default_location_for_type_when_no_location_term_is_set(): void
    {
        $this->stubExistingSnippet(6, typeTerms: ['css'], locationTerms: []);

        $result = $this->service->getSnippet(6);

        $this->assertSame('header', $result['location']);
    }

    public function test_get_snippet_defaults_priority_to_10_when_meta_is_empty(): void
    {
        $this->stubExistingSnippet(6);

        $result = $this->service->getSnippet(6);

        $this->assertSame(10, $result['priority']);
    }

    public function test_get_snippet_reports_the_stored_priority(): void
    {
        $this->stubExistingSnippet(6, metaOverrides: ['_wpcode_priority' => '5']);

        $result = $this->service->getSnippet(6);

        $this->assertSame(5, $result['priority']);
    }

    public function test_get_snippet_defaults_insert_method_to_auto_when_meta_is_empty(): void
    {
        $this->stubExistingSnippet(6);

        $result = $this->service->getSnippet(6);

        $this->assertSame('auto', $result['insertMethod']);
    }

    public function test_get_snippet_reports_insert_method_shortcode_when_auto_insert_is_disabled(): void
    {
        $this->stubExistingSnippet(6, metaOverrides: ['_wpcode_auto_insert' => '0']);

        $result = $this->service->getSnippet(6);

        $this->assertSame('shortcode', $result['insertMethod']);
    }

    public function test_get_snippet_reports_shortcode_attributes(): void
    {
        $this->stubExistingSnippet(6, metaOverrides: ['_wpcode_shortcode_attributes' => ['color', 'size']]);

        $result = $this->service->getSnippet(6);

        $this->assertSame(['color', 'size'], $result['shortcodeAttributes']);
    }

    public function test_get_snippet_defaults_shortcode_attributes_to_empty_array(): void
    {
        $this->stubExistingSnippet(6);

        $result = $this->service->getSnippet(6);

        $this->assertSame([], $result['shortcodeAttributes']);
    }

    // ── createSnippet error handling ─────────────────────────────────────────
    // Regression coverage for the bug where a failed wp_insert_post returned a
    // WP_Error that was cast to int 1, writing snippet meta onto post ID 1.

    public function test_create_snippet_throws_when_wp_insert_post_fails(): void
    {
        Functions\when('sanitize_text_field')->returnArg();
        Functions\when('wp_unslash')->returnArg();
        Functions\when('wp_insert_post')->justReturn(new \WP_Error('db_insert_error', 'Could not insert post.'));
        Functions\when('is_wp_error')->alias(fn($thing) => $thing instanceof \WP_Error);
        Functions\expect('update_post_meta')->never();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Could not insert post.');

        $this->service->createSnippet(['name' => 'Broken', 'code' => 'echo 1;']);
    }

    public function test_update_snippet_throws_when_wp_update_post_fails(): void
    {
        $this->stubExistingSnippet(6);
        Functions\when('wp_update_post')->justReturn(new \WP_Error('db_update_error', 'Could not update post.'));
        Functions\when('is_wp_error')->alias(fn($thing) => $thing instanceof \WP_Error);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Could not update post.');

        $this->service->updateSnippet(6, ['name' => 'New title']);
    }

    // ── setTags (via updateSnippet) ──────────────────────────────────────────
    // setTags() now delegates entirely to wp_set_post_terms(), which creates any
    // term passed by name that doesn't already exist in the taxonomy.

    public function test_update_snippet_passes_tag_names_straight_to_wp_set_post_terms(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('wp_set_post_terms')
            ->once()
            ->with(6, ['php', 'utility'], 'wpcode_tags');

        $this->service->updateSnippet(6, ['tags' => ['php', 'utility']]);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_does_not_touch_tags_when_omitted(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('wp_set_post_terms')->never();

        $this->service->updateSnippet(6, ['name' => 'New title']);
        $this->addToAssertionCount(1);
    }

    // ── deleteSnippet ─────────────────────────────────────────────────────────

    public function test_delete_snippet_deletes_the_post_and_returns_true(): void
    {
        $this->stubExistingSnippet(6);

        $deletedPost = new WP_Post();
        $deletedPost->ID = 6;
        Functions\expect('wp_delete_post')->once()->with(6, true)->andReturn($deletedPost);

        $this->assertTrue($this->service->deleteSnippet(6));
    }

    public function test_delete_snippet_returns_false_when_the_post_does_not_exist(): void
    {
        Functions\when('get_post')->justReturn(null);
        Functions\expect('wp_delete_post')->never();

        $this->assertFalse($this->service->deleteSnippet(999));
    }

    public function test_delete_snippet_returns_false_when_wp_delete_post_fails(): void
    {
        $this->stubExistingSnippet(6);
        Functions\when('wp_delete_post')->justReturn(false);

        $this->assertFalse($this->service->deleteSnippet(6));
    }

    /**
     * @param string[]             $typeTerms
     * @param string[]             $locationTerms
     * @param array<string, mixed> $metaOverrides
     */
    private function stubExistingSnippet(int $id, array $typeTerms = [], array $locationTerms = [], array $metaOverrides = []): void
    {
        $post               = new WP_Post();
        $post->ID           = $id;
        $post->post_type    = 'wpcode';
        $post->post_title   = 'Existing';
        $post->post_content = 'code';
        $post->post_status  = 'draft';

        Functions\when('get_post')->justReturn($post);
        Functions\when('wp_update_post')->justReturn($id);
        Functions\when('get_post_meta')->alias(
            fn($postId, $key) => $metaOverrides[$key] ?? '',
        );
        Functions\when('wp_get_post_terms')->alias(
            fn($postId, $taxonomy) => match ($taxonomy) {
                'wpcode_type' => $typeTerms,
                'wpcode_location' => $locationTerms,
                default => [],
            },
        );
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('sanitize_text_field')->returnArg();
        Functions\when('sanitize_key')->returnArg();
        Functions\when('wp_unslash')->returnArg();
    }
}
