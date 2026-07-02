<?php

namespace Loopress\Tests\Unit\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Service\WPCodeService;
use PHPUnit\Framework\TestCase;
use WP_Post;

class WPCodeServiceTest extends TestCase
{
    private WPCodeService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->service = new WPCodeService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── saveMeta (via updateSnippet) ─────────────────────────────────────────
    // Regression coverage for the bug where an update that omitted `type`
    // silently reset the stored snippet type back to 'php'.

    public function test_update_snippet_does_not_touch_type_meta_when_type_is_omitted(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('update_post_meta')->never();

        $this->service->updateSnippet(6, ['title' => 'New title']);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_writes_type_meta_when_type_is_present(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('update_post_meta')
            ->once()
            ->with(6, '_wpcode_snippet_type', 'text');

        $this->service->updateSnippet(6, ['type' => 'text']);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_does_not_touch_note_meta_when_note_is_omitted(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('update_post_meta')->never();

        $this->service->updateSnippet(6, ['title' => 'New title']);
        $this->addToAssertionCount(1);
    }

    // ── normalize (via getSnippet) ────────────────────────────────────────────

    public function test_get_snippet_reports_the_stored_type(): void
    {
        $this->stubExistingSnippet(6);
        Functions\when('get_post_meta')->justReturn('text');

        $result = $this->service->getSnippet(6);

        $this->assertSame('text', $result['type']);
    }

    public function test_get_snippet_falls_back_to_php_only_when_meta_is_empty(): void
    {
        $this->stubExistingSnippet(6);
        Functions\when('get_post_meta')->justReturn('');

        $result = $this->service->getSnippet(6);

        $this->assertSame('php', $result['type']);
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

        $this->service->createSnippet(['title' => 'Broken', 'code' => 'echo 1;']);
    }

    public function test_update_snippet_throws_when_wp_update_post_fails(): void
    {
        $this->stubExistingSnippet(6);
        Functions\when('wp_update_post')->justReturn(new \WP_Error('db_update_error', 'Could not update post.'));
        Functions\when('is_wp_error')->alias(fn($thing) => $thing instanceof \WP_Error);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Could not update post.');

        $this->service->updateSnippet(6, ['title' => 'New title']);
    }

    // ── setTags (via updateSnippet) ──────────────────────────────────────────
    // setTags() now delegates entirely to wp_set_post_terms(), which creates any
    // term passed by name that doesn't already exist in the taxonomy.

    public function test_update_snippet_passes_tag_names_straight_to_wp_set_post_terms(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('wp_set_post_terms')
            ->once()
            ->with(6, ['php', 'utility'], 'wpcode-tags');

        $this->service->updateSnippet(6, ['tags' => ['php', 'utility']]);
        $this->addToAssertionCount(1);
    }

    public function test_update_snippet_does_not_touch_tags_when_omitted(): void
    {
        $this->stubExistingSnippet(6);

        Functions\expect('wp_set_post_terms')->never();

        $this->service->updateSnippet(6, ['title' => 'New title']);
        $this->addToAssertionCount(1);
    }

    private function stubExistingSnippet(int $id): void
    {
        $post               = new WP_Post();
        $post->ID           = $id;
        $post->post_type    = 'wpcode';
        $post->post_title   = 'Existing';
        $post->post_content = 'code';
        $post->post_status  = 'draft';

        Functions\when('get_post')->justReturn($post);
        Functions\when('wp_update_post')->justReturn($id);
        Functions\when('get_post_meta')->justReturn('');
        Functions\when('wp_get_post_terms')->justReturn([]);
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('sanitize_text_field')->returnArg();
        Functions\when('wp_unslash')->returnArg();
    }
}
