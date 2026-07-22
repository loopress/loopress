<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Seo\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Seo\Service\YoastService;
use PHPUnit\Framework\TestCase;
use WP_Post;

class YoastServiceTest extends TestCase
{
    private YoastService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->service = new YoastService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── isActive ─────────────────────────────────────────────────────────────

    public function test_is_not_active_when_the_yoast_constant_is_missing(): void
    {
        // WPSEO_VERSION genuinely isn't defined in the test environment (Yoast isn't loaded),
        // so this exercises the real defined() check, same convention as AcfServiceTest and
        // RankMathServiceTest's isActive() coverage.
        $this->assertFalse($this->service->isActive());
    }

    // ── post meta ────────────────────────────────────────────────────────────

    public function test_list_post_meta_returns_only_yoast_prefixed_keys(): void
    {
        $post = $this->fakePost(1, 'hello-world', 'Hello World');

        Functions\when('get_posts')->justReturn([$post]);
        Functions\when('get_post_meta')->justReturn([
            '_edit_lock'                     => ['123:1'],
            '_yoast_wpseo_title'              => ['Hello SEO'],
            '_yoast_wpseo_meta-robots-noindex' => [['1', '0']],
        ]);

        $result = $this->service->listPostMeta('post');

        $this->assertCount(1, $result);
        $this->assertSame('hello-world', $result[0]['slug']);
        $this->assertSame(
            ['_yoast_wpseo_title' => 'Hello SEO', '_yoast_wpseo_meta-robots-noindex' => ['1', '0']],
            $result[0]['meta'],
        );
    }

    public function test_list_post_meta_keeps_multi_value_meta_as_an_array(): void
    {
        Functions\when('get_posts')->justReturn([$this->fakePost(1, 'hello', 'Hello')]);
        Functions\when('get_post_meta')->justReturn(['_yoast_wpseo_focuskw' => ['seo', 'wordpress']]);

        $result = $this->service->listPostMeta('post');

        $this->assertSame(['_yoast_wpseo_focuskw' => ['seo', 'wordpress']], $result[0]['meta']);
    }

    public function test_get_post_meta_returns_null_when_no_post_matches_the_slug(): void
    {
        Functions\when('get_page_by_path')->justReturn(false);

        $this->assertNull($this->service->getPostMeta('post', 'missing'));
    }

    public function test_get_post_meta_returns_the_post_when_found(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(3, 'about', 'About'));
        Functions\when('get_post_meta')->justReturn(['_yoast_wpseo_title' => ['About us']]);

        $result = $this->service->getPostMeta('page', 'about');

        $this->assertSame('about', $result['slug']);
        $this->assertSame(['_yoast_wpseo_title' => 'About us'], $result['meta']);
    }

    public function test_upsert_post_meta_throws_when_no_post_matches_the_slug(): void
    {
        Functions\when('get_page_by_path')->justReturn(false);

        $this->expectException(\RuntimeException::class);
        $this->service->upsertPostMeta('post', 'missing', ['_yoast_wpseo_title' => 'x']);
    }

    public function test_upsert_post_meta_updates_incoming_keys_and_deletes_removed_ones(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(5, 'hello', 'Hello'));
        Functions\when('get_post_meta')->justReturn([
            '_yoast_wpseo_metadesc' => ['Old desc'],
            '_yoast_wpseo_old_field' => ['stale'],
            '_yoast_wpseo_title'    => ['Old title'],
        ]);

        $updated = [];
        Functions\when('update_post_meta')->alias(function (int $postId, string $key, mixed $value) use (&$updated): void {
            $updated[$key] = $value;
        });
        $deleted = [];
        Functions\when('delete_post_meta')->alias(function (int $postId, string $key) use (&$deleted): void {
            $deleted[] = $key;
        });

        $this->service->upsertPostMeta('post', 'hello', [
            '_yoast_wpseo_metadesc' => 'New desc',
            '_yoast_wpseo_title'    => 'New title',
        ]);

        $this->assertSame(['_yoast_wpseo_metadesc' => 'New desc', '_yoast_wpseo_title' => 'New title'], $updated);
        $this->assertSame(['_yoast_wpseo_old_field'], $deleted);
    }

    // ── settings ─────────────────────────────────────────────────────────────

    public function test_get_settings_returns_the_stored_option(): void
    {
        Functions\when('get_option')->justReturn(['title_separator' => '-']);

        $this->assertSame(['title_separator' => '-'], $this->service->getSettings());
    }

    public function test_get_settings_returns_an_empty_array_when_the_option_is_not_an_array(): void
    {
        Functions\when('get_option')->justReturn(false);

        $this->assertSame([], $this->service->getSettings());
    }

    public function test_update_settings_stores_and_returns_the_new_value(): void
    {
        $stored = [];
        Functions\when('update_option')->alias(function (string $name, mixed $value) use (&$stored): void {
            $stored = $value;
        });
        // A regular closure, not an arrow function: `fn() => $stored` would capture $stored by
        // value at creation time (empty array, before update_option ever runs), not by
        // reference, so the later read would miss the update entirely.
        Functions\when('get_option')->alias(function () use (&$stored): mixed {
            return $stored;
        });

        $result = $this->service->updateSettings(['title_separator' => '|']);

        $this->assertSame(['title_separator' => '|'], $result);
    }

    private function fakePost(int $id, string $slug, string $title): WP_Post
    {
        $post             = new WP_Post();
        $post->ID         = $id;
        $post->post_name  = $slug;
        $post->post_title = $title;

        return $post;
    }
}
