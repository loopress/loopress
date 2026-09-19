<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Seo\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Seo\Exception\StaleSeoRevisionException;
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
        // getPostMeta()/getSettings()'s revision hash goes through wp_json_encode(), unavailable
        // outside a real WordPress load; a plain json_encode() delegate does the same thing here.
        Functions\when('wp_json_encode')->alias(static fn (mixed $value): string|false => json_encode($value));
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

    // Regression coverage: the write loop used to accept any key in the request body,
    // so a key belonging to another plugin (ACF, FluentCRM, etc.) on the same post could be
    // silently overwritten. It must now be bounded to this provider's own prefix, same as reads.
    public function test_upsert_post_meta_silently_ignores_a_key_outside_the_yoast_prefix(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(5, 'hello', 'Hello'));
        Functions\when('get_post_meta')->justReturn(['_yoast_wpseo_title' => ['Old title']]);

        $updated = [];
        Functions\when('update_post_meta')->alias(function (int $postId, string $key, mixed $value) use (&$updated): void {
            $updated[$key] = $value;
        });
        Functions\when('delete_post_meta')->justReturn(true);

        $this->service->upsertPostMeta('post', 'hello', [
            '_yoast_wpseo_title' => 'New title',
            'some_other_plugin_field' => 'should not be written',
        ]);

        $this->assertSame(['_yoast_wpseo_title' => 'New title'], $updated);
    }

    // ── settings ─────────────────────────────────────────────────────────────

    public function test_get_settings_returns_the_stored_option(): void
    {
        Functions\when('get_option')->justReturn(['title_separator' => '-']);

        $this->assertSame(['title_separator' => '-'], $this->service->getSettings()['settings']);
    }

    public function test_get_settings_returns_an_empty_array_when_the_option_is_not_an_array(): void
    {
        Functions\when('get_option')->justReturn(false);

        $this->assertSame([], $this->service->getSettings()['settings']);
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

        $this->assertSame(['title_separator' => '|'], $result['settings']);
    }

    // ── revision / conditional writes (#234) ────────────────────────────────

    public function test_get_settings_revision_is_stable_for_the_same_value(): void
    {
        Functions\when('get_option')->justReturn(['title_separator' => '-']);

        $first  = $this->service->getSettings();
        $second = $this->service->getSettings();

        $this->assertSame($first['revision'], $second['revision']);
    }

    public function test_get_settings_revision_differs_for_a_different_value(): void
    {
        Functions\when('get_option')->justReturn(['title_separator' => '-']);
        $before = $this->service->getSettings();

        Functions\when('get_option')->justReturn(['title_separator' => '|']);
        $after = $this->service->getSettings();

        $this->assertNotSame($before['revision'], $after['revision']);
    }

    public function test_update_settings_succeeds_when_the_expected_revision_still_matches(): void
    {
        // get_option() intentionally stays on this same constant throughout: the precondition
        // check re-reads it before update_option() ever runs, so a mock that only starts
        // reflecting the new value after the write (as a $stored-tracking alias would) makes the
        // precondition see stale-looking data and throw, even though nothing really changed
        // between the read and the write.
        Functions\when('get_option')->justReturn(['title_separator' => '-']);
        $currentRevision = $this->service->getSettings()['revision'];

        Functions\when('update_option')->justReturn(true);

        $result = $this->service->updateSettings(['title_separator' => '|'], $currentRevision);

        $this->assertSame(['title_separator' => '-'], $result['settings']);
    }

    // Regression coverage (#234): the whole point of the precondition is that a write is refused,
    // not silently applied, once the settings no longer hold the value the caller last read.
    public function test_update_settings_throws_stale_revision_exception_when_the_value_changed_underneath(): void
    {
        Functions\when('get_option')->justReturn(['title_separator' => 'someone else changed this']);
        Functions\expect('update_option')->never();

        $this->expectException(StaleSeoRevisionException::class);
        $this->service->updateSettings(['title_separator' => '|'], 'a-revision-that-no-longer-matches');
    }

    public function test_update_settings_skips_the_revision_check_entirely_when_none_is_given(): void
    {
        $stored = [];
        Functions\when('update_option')->alias(function (string $name, mixed $value) use (&$stored): void {
            $stored = $value;
        });
        Functions\when('get_option')->alias(function () use (&$stored): mixed {
            return $stored;
        });

        $result = $this->service->updateSettings(['title_separator' => '|']);

        $this->assertSame(['title_separator' => '|'], $result['settings']);
    }

    // ── post meta: revision / conditional writes (#234) ─────────────────────

    public function test_get_post_meta_revision_is_stable_for_the_same_meta(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(5, 'hello', 'Hello'));
        Functions\when('get_post_meta')->justReturn(['_yoast_wpseo_title' => ['Old title']]);

        $first  = $this->service->getPostMeta('post', 'hello');
        $second = $this->service->getPostMeta('post', 'hello');

        $this->assertSame($first['revision'], $second['revision']);
    }

    public function test_get_post_meta_revision_differs_for_a_different_meta(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(5, 'hello', 'Hello'));

        Functions\when('get_post_meta')->justReturn(['_yoast_wpseo_title' => ['Old title']]);
        $before = $this->service->getPostMeta('post', 'hello');

        Functions\when('get_post_meta')->justReturn(['_yoast_wpseo_title' => ['New title']]);
        $after = $this->service->getPostMeta('post', 'hello');

        $this->assertNotSame($before['revision'], $after['revision']);
    }

    public function test_upsert_post_meta_succeeds_when_the_expected_revision_still_matches(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(5, 'hello', 'Hello'));
        Functions\when('get_post_meta')->justReturn(['_yoast_wpseo_title' => ['Old title']]);
        $currentRevision = $this->service->getPostMeta('post', 'hello')['revision'];

        Functions\when('update_post_meta')->justReturn(true);
        Functions\when('delete_post_meta')->justReturn(true);

        $result = $this->service->upsertPostMeta('post', 'hello', ['_yoast_wpseo_title' => 'New title'], $currentRevision);

        $this->assertSame('hello', $result['slug']);
    }

    // Regression coverage (#234): a post whose meta changed underneath (another editor, a plugin
    // hook) must refuse the write rather than silently overwrite it.
    public function test_upsert_post_meta_throws_stale_revision_exception_when_the_meta_changed_underneath(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(5, 'hello', 'Hello'));
        Functions\when('get_post_meta')->justReturn(['_yoast_wpseo_title' => ['Someone else changed this']]);
        Functions\expect('update_post_meta')->never();

        $this->expectException(StaleSeoRevisionException::class);
        $this->service->upsertPostMeta('post', 'hello', ['_yoast_wpseo_title' => 'New title'], 'a-revision-that-no-longer-matches');
    }

    public function test_upsert_post_meta_skips_the_revision_check_entirely_when_none_is_given(): void
    {
        Functions\when('get_page_by_path')->justReturn($this->fakePost(5, 'hello', 'Hello'));
        Functions\when('get_post_meta')->justReturn(['_yoast_wpseo_title' => ['Old title']]);
        Functions\when('update_post_meta')->justReturn(true);
        Functions\when('delete_post_meta')->justReturn(true);

        $result = $this->service->upsertPostMeta('post', 'hello', ['_yoast_wpseo_title' => 'New title']);

        $this->assertSame('hello', $result['slug']);
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
