<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pages;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Pages\ManagedPage;
use Loopress\Pages\RestApi\PagesController;
use PHPUnit\Framework\TestCase;
use WP_Post;
use WP_REST_Request;

class PagesControllerTest extends TestCase
{
    private PagesController $controller;

    /** @var array<int, array{name: string, status: string, managed: bool, html: string, desired?: string, fullWidth?: bool, hideTitle?: bool, template?: string}> */
    private array $pages = [];

    // What wp_unique_post_slug() answers for a given slug; unlisted slugs are free.
    /** @var array<string, string> */
    private array $takenSlugs = [];

    /** @var array<int, array{fn: string, postarr: array<string, mixed>}> */
    private array $writes = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->controller = new PagesController();

        // put_page()'s named lock: granted unless a test says otherwise, every query recorded.
        $wpdb = new class() {
            public string $prefix = 'wp_';
            public string $lockResult = '1';
            /** @var string[] */
            public array $queries = [];

            public function prepare(string $query, mixed ...$args): string
            {
                return vsprintf(str_replace(['%s', '%d'], ["'%s'", '%d'], $query), $args);
            }

            public function get_var(string $query): string
            {
                $this->queries[] = $query;
                return $this->lockResult;
            }

            public function query(string $query): int
            {
                $this->queries[] = $query;
                return 1;
            }
        };
        $GLOBALS['wpdb'] = $wpdb;

        Functions\when('wp_slash')->returnArg();
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('get_permalink')->alias(fn(WP_Post $post): string => "https://example.test/{$post->post_name}/");
        Functions\when('get_post_type')->alias(fn(int $id): string|false => isset($this->pages[$id]) ? 'page' : false);
        Functions\when('get_post_meta')->alias(function (int $id, string $key): string {
            $page = $this->pages[$id] ?? null;
            return match (true) {
                $page === null                       => '',
                $key === ManagedPage::MARKER_META     => $page['managed'] ? '1' : '',
                $key === ManagedPage::HTML_META       => $page['html'],
                $key === ManagedPage::FULL_WIDTH_META => ($page['fullWidth'] ?? false) ? '1' : '0',
                $key === ManagedPage::HIDE_TITLE_META => ($page['hideTitle'] ?? false) ? '1' : '0',
                default                              => '',
            };
        });
        Functions\when('get_post')->alias(function (int $id): ?WP_Post {
            $page = $this->pages[$id] ?? null;
            if ($page === null) {
                return null;
            }
            $post              = new WP_Post();
            $post->ID          = $id;
            $post->post_name   = $page['name'];
            $post->post_status = $page['status'];
            $post->post_title  = 'Title';
            $post->post_type   = 'page';
            return $post;
        });
        Functions\when('get_page_template_slug')->alias(fn(WP_Post $post): string => $this->pages[$post->ID]['template'] ?? '');
        Functions\when('get_posts')->alias(fn(array $args): array => $this->queryPages($args));
        Functions\when('wp_unique_post_slug')->alias(fn(string $slug): string => $this->takenSlugs[$slug] ?? $slug);
        Functions\when('wp_insert_post')->alias(function (array $postarr): int {
            $this->writes[] = ['fn' => 'insert', 'postarr' => $postarr];
            $id             = 100;
            $this->pages[$id] = [
                'name'      => $postarr['post_name'],
                'status'    => $postarr['post_status'],
                'managed'   => true,
                'html'      => $postarr['meta_input'][ManagedPage::HTML_META],
                'fullWidth' => $postarr['meta_input'][ManagedPage::FULL_WIDTH_META] === '1',
                'hideTitle' => $postarr['meta_input'][ManagedPage::HIDE_TITLE_META] === '1',
                'template'  => $postarr['page_template'],
            ];
            return $id;
        });
        Functions\when('wp_update_post')->alias(function (array $postarr): int {
            $this->writes[]                            = ['fn' => 'update', 'postarr' => $postarr];
            $this->pages[$postarr['ID']]['status']    = $postarr['post_status'];
            $this->pages[$postarr['ID']]['html']      = $postarr['meta_input'][ManagedPage::HTML_META];
            $this->pages[$postarr['ID']]['fullWidth'] = $postarr['meta_input'][ManagedPage::FULL_WIDTH_META] === '1';
            $this->pages[$postarr['ID']]['hideTitle'] = $postarr['meta_input'][ManagedPage::HIDE_TITLE_META] === '1';
            $this->pages[$postarr['ID']]['template']  = $postarr['page_template'];
            return $postarr['ID'];
        });
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['wpdb']);
        Monkey\tearDown();
        parent::tearDown();
    }

    /**
     * @param array<string, mixed> $args
     * @return int[]
     */
    private function queryPages(array $args): array
    {
        $ids = [];
        foreach ($this->pages as $id => $page) {
            $isTrash = $page['status'] === 'trash';
            if (($args['post_status'] === 'trash') !== $isTrash) {
                continue;
            }
            if (isset($args['name']) && $page['name'] !== $args['name']) {
                continue;
            }
            if (isset($args['meta_key']) && !$page['managed']) {
                continue;
            }
            if (isset($args['meta_query']) && (!$page['managed'] || ($page['desired'] ?? null) !== $args['meta_query'][0]['value'])) {
                continue;
            }
            $ids[] = $id;
        }
        return $ids;
    }

    private function put(
        string $slug,
        string $html = '<h1>Hi</h1>',
        string $status = 'draft',
        bool $fullWidth = false,
        bool $hideTitle = false,
        string $template = '',
    ): \WP_REST_Response {
        return $this->controller->put_page(new WP_REST_Request([
            'slug'      => $slug,
            'title'     => 'About',
            'status'    => $status,
            'html'      => $html,
            'fullWidth' => $fullWidth,
            'hideTitle' => $hideTitle,
            'template'  => $template,
        ]));
    }

    public function test_creates_a_new_page_with_empty_post_content_and_the_html_in_meta(): void
    {
        $response = $this->put('about', '<h1>Hi</h1>');

        $this->assertSame(201, $response->status);
        $this->assertSame('insert', $this->writes[0]['fn']);
        $postarr = $this->writes[0]['postarr'];
        $this->assertSame('', $postarr['post_content']);
        $this->assertSame('about', $postarr['post_name']);
        $this->assertSame('draft', $postarr['post_status']);
        $this->assertSame(
            ['_loopress_page' => '1', '_loopress_page_html' => '<h1>Hi</h1>', '_loopress_page_full_width' => '0', '_loopress_page_hide_title' => '0'],
            $postarr['meta_input']
        );
        $this->assertSame('<h1>Hi</h1>', $response->get_data()['html']);
    }

    public function test_stores_full_width_and_hide_title_as_meta(): void
    {
        $response = $this->put('about', '<h1>Hi</h1>', 'draft', true, true);

        $postarr = $this->writes[0]['postarr'];
        $this->assertSame('1', $postarr['meta_input']['_loopress_page_full_width']);
        $this->assertSame('1', $postarr['meta_input']['_loopress_page_hide_title']);
        $this->assertTrue($response->get_data()['fullWidth']);
        $this->assertTrue($response->get_data()['hideTitle']);
    }

    public function test_stores_the_page_template(): void
    {
        $response = $this->put('about', '<h1>Hi</h1>', 'draft', false, false, 'page-no-title');

        $this->assertSame('page-no-title', $this->writes[0]['postarr']['page_template']);
        $this->assertSame('page-no-title', $response->get_data()['template']);
    }

    public function test_updates_an_existing_managed_page_in_place(): void
    {
        $this->pages[7] = ['name' => 'about', 'status' => 'publish', 'managed' => true, 'html' => 'old'];

        $response = $this->put('about', 'new', 'draft');

        $this->assertSame(200, $response->status);
        $this->assertSame('update', $this->writes[0]['fn']);
        $this->assertSame(7, $this->writes[0]['postarr']['ID']);
        $this->assertSame('draft', $response->get_data()['status']);
    }

    public function test_refuses_a_page_not_managed_by_loopress_without_writing(): void
    {
        $this->pages[7] = ['name' => 'about', 'status' => 'publish', 'managed' => false, 'html' => ''];

        $response = $this->put('about');

        $this->assertSame(409, $response->status);
        $this->assertStringContainsString('not managed by Loopress', $response->get_data()['error']);
        $this->assertSame([], $this->writes);
    }

    public function test_refuses_a_trashed_managed_page_and_asks_to_restore_it(): void
    {
        $this->pages[7] = ['name' => 'about__trashed', 'status' => 'trash', 'managed' => true, 'html' => '', 'desired' => 'about'];

        $response = $this->put('about');

        $this->assertSame(409, $response->status);
        $this->assertStringContainsString('Restore it', $response->get_data()['error']);
        $this->assertSame([], $this->writes);
    }

    public function test_refuses_a_slug_wordpress_would_rename(): void
    {
        $this->takenSlugs['about'] = 'about-2';

        $response = $this->put('about');

        $this->assertSame(409, $response->status);
        $this->assertStringContainsString('already taken', $response->get_data()['error']);
        $this->assertSame([], $this->writes);
    }

    public function test_refuses_html_over_the_per_page_limit(): void
    {
        $response = $this->put('about', str_repeat('a', 512 * 1024 + 1));

        $this->assertSame(413, $response->status);
        $this->assertStringContainsString('loopress_max_file_bytes', $response->get_data()['error']);
        $this->assertSame([], $this->writes);
    }

    public function test_refuses_a_push_that_would_exceed_the_total_limit(): void
    {
        for ($i = 1; $i <= 16; $i++) {
            $this->pages[$i] = ['name' => "p{$i}", 'status' => 'publish', 'managed' => true, 'html' => str_repeat('a', 512 * 1024)];
        }

        $response = $this->put('about', 'x');

        $this->assertSame(413, $response->status);
        $this->assertStringContainsString('loopress_max_files_total_bytes', $response->get_data()['error']);
    }

    public function test_holds_a_named_lock_around_the_push_and_releases_it(): void
    {
        $this->put('about');

        $this->assertSame([
            "SELECT GET_LOCK('wp_loopress_pages_put', 10)",
            "SELECT RELEASE_LOCK('wp_loopress_pages_put')",
        ], $GLOBALS['wpdb']->queries);
    }

    public function test_answers_503_without_writing_when_another_push_holds_the_lock(): void
    {
        $GLOBALS['wpdb']->lockResult = '0';

        $response = $this->put('about');

        $this->assertSame(503, $response->status);
        $this->assertSame([], $this->writes);
    }

    /** @param array<string, mixed> $options */
    private function withReadingOptions(array &$options): void
    {
        Functions\when('get_option')->alias(static function (string $name) use (&$options): mixed {
            return $options[$name] ?? false;
        });
        Functions\when('update_option')->alias(static function (string $name, mixed $value) use (&$options): bool {
            $options[$name] = $value;
            return true;
        });
    }

    public function test_publishing_index_makes_it_the_front_page_replacing_the_previous_one(): void
    {
        $options = ['show_on_front' => 'page', 'page_on_front' => 42];
        $this->withReadingOptions($options);

        $response = $this->put('index', '<h1>Home</h1>', 'publish');

        $this->assertSame(201, $response->status);
        $this->assertSame(['show_on_front' => 'page', 'page_on_front' => 100], $options);
        $this->assertSame('set', $response->get_data()['frontPage']);
    }

    public function test_the_push_response_links_to_the_site_root_once_index_is_the_front_page(): void
    {
        $options = ['show_on_front' => 'posts', 'page_on_front' => 0];
        $this->withReadingOptions($options);
        // get_permalink() mirrors WordPress: the front page's permalink is the site root.
        Functions\when('get_permalink')->alias(static function (WP_Post $post) use (&$options): string {
            return $options['show_on_front'] === 'page' && (int) $options['page_on_front'] === $post->ID
                ? 'https://example.test/'
                : "https://example.test/{$post->post_name}/";
        });

        $response = $this->put('index', '<h1>Home</h1>', 'publish');

        $this->assertSame('https://example.test/', $response->get_data()['link']);
    }

    public function test_repushing_the_published_front_page_leaves_the_reading_settings_alone(): void
    {
        $this->pages[7] = ['name' => 'index', 'status' => 'publish', 'managed' => true, 'html' => 'old'];
        $options        = ['show_on_front' => 'page', 'page_on_front' => '7'];
        $this->withReadingOptions($options);
        Functions\expect('update_option')->never();

        $response = $this->put('index', 'new', 'publish');

        $this->assertArrayNotHasKey('frontPage', $response->get_data());
    }

    public function test_a_draft_index_never_becomes_the_front_page(): void
    {
        $options = ['show_on_front' => 'posts', 'page_on_front' => 0];
        $this->withReadingOptions($options);

        $response = $this->put('index', '<h1>Home</h1>', 'draft');

        $this->assertSame(['show_on_front' => 'posts', 'page_on_front' => 0], $options);
        $this->assertArrayNotHasKey('frontPage', $response->get_data());
    }

    public function test_switching_the_front_page_back_to_draft_reverts_to_the_latest_posts(): void
    {
        $this->pages[7] = ['name' => 'index', 'status' => 'publish', 'managed' => true, 'html' => 'old'];
        $options        = ['show_on_front' => 'page', 'page_on_front' => '7'];
        $this->withReadingOptions($options);

        $response = $this->put('index', 'new', 'draft');

        $this->assertSame(['show_on_front' => 'posts', 'page_on_front' => 0], $options);
        $this->assertSame('unset', $response->get_data()['frontPage']);
    }

    public function test_publishing_any_other_slug_never_touches_the_front_page(): void
    {
        Functions\expect('update_option')->never();

        $response = $this->put('about', '<h1>Hi</h1>', 'publish');

        $this->assertArrayNotHasKey('frontPage', $response->get_data());
    }

    public function test_lists_only_managed_pages(): void
    {
        $this->pages[1] = ['name' => 'about', 'status' => 'publish', 'managed' => true, 'html' => '<p>a</p>'];
        $this->pages[2] = ['name' => 'contact', 'status' => 'publish', 'managed' => false, 'html' => ''];

        $data = $this->controller->list_pages()->get_data();

        $this->assertSame([[
            'slug'      => 'about',
            'title'     => 'Title',
            'status'    => 'publish',
            'link'      => 'https://example.test/about/',
            'html'      => '<p>a</p>',
            'fullWidth' => false,
            'hideTitle' => false,
            'template'  => '',
        ],], $data);
    }
}
