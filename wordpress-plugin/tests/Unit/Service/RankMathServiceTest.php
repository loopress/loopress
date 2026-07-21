<?php

namespace Loopress\Tests\Unit\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Service\RankMathService;
use Loopress\Tests\Stubs\FakeWpdb;
use PHPUnit\Framework\TestCase;
use WP_Post;

class RankMathServiceTest extends TestCase
{
    private RankMathService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->service = new RankMathService();
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['wpdb']);
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── isActive ─────────────────────────────────────────────────────────────

    public function test_is_not_active_when_the_rank_math_constant_is_missing(): void
    {
        // RANK_MATH_VERSION genuinely isn't defined in the test environment (RankMath isn't
        // loaded), so this exercises the real defined() check, same convention as
        // AcfServiceTest's isActive() coverage.
        $this->assertFalse($this->service->isActive());
    }

    // ── post meta ────────────────────────────────────────────────────────────

    public function test_list_post_meta_returns_only_rank_math_prefixed_keys(): void
    {
        $post = $this->fakePost(1, 'hello-world', 'Hello World');

        Functions\when('get_posts')->justReturn([$post]);
        Functions\when('get_post_meta')->justReturn([
            '_edit_lock'          => ['123:1'],
            'rank_math_title'     => ['Hello SEO'],
            'rank_math_robots'    => [['noindex', 'nofollow']],
        ]);

        $result = $this->service->listPostMeta('post');

        $this->assertCount(1, $result);
        $this->assertSame('hello-world', $result[0]['slug']);
        $this->assertSame(['rank_math_title' => 'Hello SEO', 'rank_math_robots' => ['noindex', 'nofollow']], $result[0]['meta']);
    }

    public function test_list_post_meta_keeps_multi_value_meta_as_an_array(): void
    {
        Functions\when('get_posts')->justReturn([$this->fakePost(1, 'hello', 'Hello')]);
        Functions\when('get_post_meta')->justReturn(['rank_math_focus_keyword' => ['seo', 'wordpress']]);

        $result = $this->service->listPostMeta('post');

        $this->assertSame(['rank_math_focus_keyword' => ['seo', 'wordpress']], $result[0]['meta']);
    }

    public function test_get_post_meta_returns_null_when_no_post_matches_the_slug(): void
    {
        Functions\when('get_page_by_path')->justReturn(false);

        $this->assertNull($this->service->getPostMeta('post', 'missing'));
    }

    public function test_get_post_meta_returns_the_post_when_found(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(3, 'about', 'About'));
        Functions\when('get_post_meta')->justReturn(['rank_math_title' => ['About us']]);

        $result = $this->service->getPostMeta('page', 'about');

        $this->assertSame('about', $result['slug']);
        $this->assertSame(['rank_math_title' => 'About us'], $result['meta']);
    }

    public function test_upsert_post_meta_throws_when_no_post_matches_the_slug(): void
    {
        Functions\when('get_page_by_path')->justReturn(false);

        $this->expectException(\RuntimeException::class);
        $this->service->upsertPostMeta('post', 'missing', ['rank_math_title' => 'x']);
    }

    public function test_upsert_post_meta_updates_incoming_keys_and_deletes_removed_ones(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(5, 'hello', 'Hello'));
        Functions\when('get_post_meta')->justReturn([
            'rank_math_description' => ['Old desc'],
            'rank_math_old_field'   => ['stale'],
            'rank_math_title'       => ['Old title'],
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
            'rank_math_description' => 'New desc',
            'rank_math_title'       => 'New title',
        ]);

        $this->assertSame(['rank_math_description' => 'New desc', 'rank_math_title' => 'New title'], $updated);
        $this->assertSame(['rank_math_old_field'], $deleted);
    }

    // ── settings ─────────────────────────────────────────────────────────────

    public function test_get_settings_returns_the_stored_option(): void
    {
        Functions\when('get_option')->justReturn(['titleSeparator' => '-']);

        $this->assertSame(['titleSeparator' => '-'], $this->service->getSettings());
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

        $result = $this->service->updateSettings(['titleSeparator' => '|']);

        $this->assertSame(['titleSeparator' => '|'], $result);
    }

    // ── redirects ────────────────────────────────────────────────────────────

    // Every redirects method starts with requireRedirectionsModuleEnabled(), so every redirects
    // test needs both the fake $wpdb and a "module enabled" get_option() stub to reach the
    // query logic under test at all.
    private function stubWpdb(): FakeWpdb
    {
        Functions\when('get_option')->justReturn(['redirections']);

        $wpdb = new FakeWpdb();
        $GLOBALS['wpdb'] = $wpdb;

        return $wpdb;
    }

    // The Redirections module is one of several RankMath ships disabled by default (confirmed
    // by hand against a real install, where the table didn't exist until the module was turned
    // on), so this must throw rather than let a raw "table doesn't exist" DB error leak through.
    public function test_list_redirections_throws_when_the_redirections_module_is_not_enabled(): void
    {
        Functions\when('get_option')->justReturn(['sitemap']);
        $GLOBALS['wpdb'] = new FakeWpdb();

        $this->expectException(\RuntimeException::class);
        $this->service->listRedirections();
    }

    public function test_list_redirections_excludes_trashed_rows(): void
    {
        Functions\when('maybe_unserialize')->alias(fn(mixed $v): mixed => $v);
        $wpdb = $this->stubWpdb();
        $wpdb->rows = [
            1 => ['id' => 1, 'sources' => [], 'url_to' => '/a', 'header_code' => 301, 'status' => 'active', 'hits' => 0, 'created' => null, 'updated' => null],
            2 => ['id' => 2, 'sources' => [], 'url_to' => '/b', 'header_code' => 301, 'status' => 'trashed', 'hits' => 0, 'created' => null, 'updated' => null],
        ];

        $result = $this->service->listRedirections();

        $this->assertCount(1, $result);
        $this->assertSame(1, $result[0]['id']);
    }

    public function test_get_redirection_returns_null_when_not_found(): void
    {
        $this->stubWpdb();

        $this->assertNull($this->service->getRedirection(999));
    }

    public function test_get_redirection_returns_the_matching_row(): void
    {
        Functions\when('maybe_unserialize')->alias(fn(mixed $v): mixed => $v);
        $wpdb = $this->stubWpdb();
        $wpdb->rows[7] = ['id' => 7, 'sources' => ['x'], 'url_to' => '/target', 'header_code' => 302, 'status' => 'active', 'hits' => 4, 'created' => 'c', 'updated' => 'u'];

        $result = $this->service->getRedirection(7);

        $this->assertSame('/target', $result['urlTo']);
        $this->assertSame(302, $result['headerCode']);
    }

    public function test_create_redirection_inserts_a_row_and_returns_it(): void
    {
        $this->stubWpdb();
        Functions\when('current_time')->justReturn('2026-07-21 00:00:00');
        Functions\when('maybe_serialize')->alias(fn(mixed $v): mixed => $v);
        Functions\when('maybe_unserialize')->alias(fn(mixed $v): mixed => $v);

        $result = $this->service->createRedirection([
            'headerCode' => 301,
            'sources'    => [['comparison' => 'exact', 'pattern' => '/old']],
            'urlTo'      => '/new',
        ]);

        $this->assertSame('/new', $result['urlTo']);
        $this->assertSame(301, $result['headerCode']);
        $this->assertSame([['comparison' => 'exact', 'pattern' => '/old']], $result['sources']);
    }

    public function test_update_redirection_returns_null_when_not_found(): void
    {
        $this->stubWpdb();

        $this->assertNull($this->service->updateRedirection(999, ['status' => 'inactive']));
    }

    public function test_update_redirection_applies_partial_changes(): void
    {
        $wpdb = $this->stubWpdb();
        $wpdb->rows[1] = ['id' => 1, 'sources' => [], 'url_to' => '/old', 'header_code' => 301, 'status' => 'active', 'hits' => 0, 'created' => 'c', 'updated' => 'c'];
        Functions\when('current_time')->justReturn('2026-07-21 00:00:00');
        Functions\when('maybe_serialize')->alias(fn(mixed $v): mixed => $v);
        Functions\when('maybe_unserialize')->alias(fn(mixed $v): mixed => $v);

        $result = $this->service->updateRedirection(1, ['status' => 'inactive']);

        $this->assertSame('inactive', $result['status']);
        $this->assertSame('/old', $result['urlTo']);
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
