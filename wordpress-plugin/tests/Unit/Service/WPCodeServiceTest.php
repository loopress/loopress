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
