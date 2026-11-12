<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Content\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Content\Exception\InvalidContentRowException;
use Loopress\Content\Exception\NotLocalEnvironmentException;
use Loopress\Content\Service\ContentService;
use Loopress\Tests\Stubs\FakeContentWpdb;
use PHPUnit\Framework\TestCase;

class ContentServiceTest extends TestCase
{
    private FakeContentWpdb $wpdb;
    private ContentService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->wpdb         = new FakeContentWpdb();
        $GLOBALS['wpdb']    = $this->wpdb; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
        $this->service      = new ContentService();

        Functions\when('get_post_types')->justReturn(['post' => 'post', 'page' => 'page']);
        Functions\when('get_taxonomies')->justReturn(['category' => 'category']);
        Functions\when('home_url')->justReturn('https://local.test');
        Functions\when('wp_get_upload_dir')->justReturn(['baseurl' => 'https://local.test/wp-content/uploads']);
        Functions\when('wp_get_environment_type')->justReturn('local');
        Functions\when('get_option')->justReturn(['home' => 'https://prod.test', 'uploadsUrl' => 'https://prod.test/wp-content/uploads']);
        Functions\when('get_current_user_id')->justReturn(7);
        Functions\when('update_option')->justReturn(true);
        Functions\when('wp_cache_flush')->justReturn(true);
        Functions\when('clean_taxonomy_cache')->justReturn(null);
        Functions\when('is_serialized')->alias(static fn (string $value): bool => preg_match('/^[as]:\d+:/', $value) === 1);
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['wpdb']);
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_info_describes_the_site_and_its_public_content_types(): void
    {
        $this->assertSame([
            'home'       => 'https://local.test',
            'uploadsUrl' => 'https://local.test/wp-content/uploads',
            'postTypes'  => ['post', 'page'],
            'taxonomies' => ['category'],
        ], $this->service->info());
    }

    public function test_export_posts_returns_posts_meta_and_relationships_with_a_cursor_when_the_page_is_full(): void
    {
        $this->wpdb->results = [
            [['ID' => 3, 'post_title' => 'A'], ['ID' => 9, 'post_title' => 'B']],
            [['post_id' => 3, 'meta_key' => 'k', 'meta_value' => 'v']],
            [['object_id' => 3, 'term_taxonomy_id' => 1, 'term_order' => 0]],
        ];

        $page = $this->service->exportPosts(0, 2);

        $this->assertCount(2, $page['posts']);
        $this->assertSame('k', $page['postmeta'][0]['meta_key']);
        $this->assertSame(1, $page['termRelationships'][0]['term_taxonomy_id']);
        $this->assertSame(9, $page['next']);
        $this->assertStringContainsString('IN (3,9)', $this->wpdb->queries[1]);
        $this->assertStringContainsString("'_edit_lock','_edit_last'", str_replace("', '", "','", $this->wpdb->queries[1]));
    }

    public function test_export_posts_ends_the_cursor_on_a_short_page(): void
    {
        $this->wpdb->results = [[['ID' => 3]], [], []];

        $this->assertNull($this->service->exportPosts(0, 100)['next']);
    }

    public function test_export_posts_without_posts_returns_empty_pages_without_further_queries(): void
    {
        $page = $this->service->exportPosts(5, 10);

        $this->assertSame(['posts' => [], 'postmeta' => [], 'termRelationships' => [], 'next' => null], $page);
        $this->assertCount(1, $this->wpdb->queries);
    }

    public function test_export_posts_skips_relationships_when_no_taxonomy_is_public(): void
    {
        Functions\when('get_taxonomies')->justReturn([]);
        $this->wpdb->results = [[['ID' => 3]], []];

        $page = $this->service->exportPosts(0, 100);

        $this->assertSame([], $page['termRelationships']);
        $this->assertCount(2, $this->wpdb->queries);
    }

    public function test_export_terms_returns_terms_taxonomy_rows_and_meta(): void
    {
        $this->wpdb->results = [
            [['term_id' => 4, 'name' => 'News'], ['term_id' => 6, 'name' => 'Misc']],
            [['term_taxonomy_id' => 4, 'term_id' => 4, 'taxonomy' => 'category']],
            [['term_id' => 4, 'meta_key' => 'color', 'meta_value' => 'red']],
        ];

        $page = $this->service->exportTerms(0, 2);

        $this->assertSame('News', $page['terms'][0]['name']);
        $this->assertSame('category', $page['termTaxonomy'][0]['taxonomy']);
        $this->assertSame('color', $page['termmeta'][0]['meta_key']);
        $this->assertSame(6, $page['next']);
    }

    public function test_export_terms_is_empty_without_public_taxonomies_or_terms(): void
    {
        $empty = ['terms' => [], 'termTaxonomy' => [], 'termmeta' => [], 'next' => null];

        $this->assertSame($empty, $this->service->exportTerms(0, 10));

        Functions\when('get_taxonomies')->justReturn([]);
        $this->wpdb->queries = [];
        $this->assertSame($empty, $this->service->exportTerms(0, 10));
        $this->assertSame([], $this->wpdb->queries);
    }

    public function test_reset_deletes_local_content_and_remembers_the_source_site(): void
    {
        $this->wpdb->columns = [['1', '2'], ['5']];
        $saved               = null;
        Functions\when('update_option')->alias(static function (string $name, mixed $value) use (&$saved): bool {
            $saved = [$name, $value];

            return true;
        });

        $result = $this->service->reset('https://prod.test', 'https://prod.test/up');

        $this->assertSame(['posts' => 2, 'terms' => 1], $result);
        $this->assertSame(['loopress_content_source', ['home' => 'https://prod.test', 'uploadsUrl' => 'https://prod.test/up']], $saved);
        $deletes = implode("\n", array_filter($this->wpdb->queries, static fn(string $q): bool => str_starts_with($q, 'DELETE')));
        $this->assertStringContainsString('DELETE FROM wp_posts WHERE ID IN (1,2)', $deletes);
        $this->assertStringContainsString('DELETE FROM wp_postmeta WHERE post_id IN (1,2)', $deletes);
        $this->assertStringContainsString('DELETE FROM wp_terms WHERE term_id IN (5)', $deletes);
    }

    public function test_reset_without_public_taxonomies_deletes_no_term(): void
    {
        Functions\when('get_taxonomies')->justReturn([]);
        $this->wpdb->columns = [['1']];

        $this->assertSame(['posts' => 1, 'terms' => 0], $this->service->reset('https://prod.test', 'u'));
    }

    public function test_import_and_reset_refuse_to_run_outside_a_local_site(): void
    {
        Functions\when('wp_get_environment_type')->justReturn('production');

        foreach ([
            fn(): array => $this->service->reset('h', 'u'),
            fn(): array => $this->service->importPosts([], [], []),
            fn(): array => $this->service->importTerms([], [], []),
        ] as $call) {
            try {
                $call();
                $this->fail('Expected NotLocalEnvironmentException');
            } catch (NotLocalEnvironmentException $e) {
                $this->assertStringContainsString('"local"', $e->getMessage());
            }
        }
        $this->assertSame([], $this->wpdb->queries);
    }

    public function test_import_posts_replaces_rows_rewrites_urls_and_attributes_posts_to_the_importer(): void
    {
        $count = $this->service->importPosts(
            [['ID' => 3, 'post_title' => 'A', 'post_content' => '<a href="https://prod.test/about">x</a><img src="https://prod.test/wp-content/uploads/a.png">', 'evil' => 'DROP', 'post_author' => 99]],
            [
                ['post_id' => 3, 'meta_key' => 'k', 'meta_value' => 'https://prod.test/x'],
                ['post_id' => 50, 'meta_key' => 'orphan', 'meta_value' => 'v'],
            ],
            [
                ['object_id' => 3, 'term_taxonomy_id' => 1, 'term_order' => 0],
                ['object_id' => 50, 'term_taxonomy_id' => 1, 'term_order' => 0],
            ],
        );

        $this->assertSame(['posts' => 1], $count);
        $this->assertContains('DELETE FROM wp_posts WHERE ID IN (3)', $this->wpdb->queries);

        [$table, $row] = $this->wpdb->inserted[0];
        $this->assertSame('wp_posts', $table);
        $this->assertSame(7, $row['post_author']);
        $this->assertSame(0, $row['comment_count']);
        $this->assertArrayNotHasKey('evil', $row);
        $this->assertSame('<a href="https://local.test/about">x</a><img src="https://prod.test/wp-content/uploads/a.png">', $row['post_content']);

        $this->assertCount(2, $this->wpdb->inserted);
        $this->assertSame(['wp_postmeta', ['post_id' => 3, 'meta_key' => 'k', 'meta_value' => 'https://local.test/x']], $this->wpdb->inserted[1]);
        $this->assertSame([['wp_term_relationships', ['object_id' => 3, 'term_taxonomy_id' => 1, 'term_order' => 0]]], $this->wpdb->replaced);
    }

    public function test_import_posts_rejects_rows_without_their_key_or_with_non_scalar_columns(): void
    {
        foreach ([[['post_title' => 'no id']], ['not an object'], [['ID' => 1, 'post_title' => ['nested']]]] as $posts) {
            try {
                $this->service->importPosts($posts, [], []);
                $this->fail('Expected InvalidContentRowException');
            } catch (InvalidContentRowException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_a_failed_write_fails_the_batch_with_the_database_error(): void
    {
        $this->wpdb->failWrites = true;

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Could not write to wp_posts: disk full');
        $this->service->importPosts([['ID' => 1]], [], []);
    }

    public function test_import_terms_writes_terms_taxonomy_rows_and_meta_of_known_terms_only(): void
    {
        $cleaned = [];
        Functions\when('clean_taxonomy_cache')->alias(static function (string $taxonomy) use (&$cleaned): void {
            $cleaned[] = $taxonomy;
        });
        $this->wpdb->columns = [['40']];

        $result = $this->service->importTerms(
            [['term_id' => 4, 'name' => 'News', 'slug' => 'news']],
            [
                ['term_taxonomy_id' => 4, 'term_id' => 4, 'taxonomy' => 'category'],
                ['term_taxonomy_id' => 8, 'term_id' => 80, 'taxonomy' => 'category'],
            ],
            [
                ['term_id' => 4, 'meta_key' => 'link', 'meta_value' => 'https://prod.test/p'],
                ['term_id' => 80, 'meta_key' => 'x', 'meta_value' => 'y'],
            ],
        );

        $this->assertSame(['terms' => 1], $result);
        $tables = array_column($this->wpdb->inserted, 0);
        $this->assertSame(['wp_terms', 'wp_term_taxonomy', 'wp_termmeta'], $tables);
        $this->assertSame('https://local.test/p', $this->wpdb->inserted[2][1]['meta_value']);
        $this->assertSame(['category'], $cleaned);
        $this->assertContains('DELETE FROM wp_term_taxonomy WHERE term_taxonomy_id IN (4,8,40)', $this->wpdb->queries);
    }
}
