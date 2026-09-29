<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pages;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Pages\RestApi\TemplatesController;
use PHPUnit\Framework\TestCase;
use WP_Post;
use WP_REST_Request;

class TemplatesControllerTest extends TestCase
{
    private TemplatesController $controller;

    private bool $blockTheme = true;

    /** @var array<int, array{name: string, content: string, managed: bool, theme: string}> */
    private array $templates = [];

    /** @var array<int, array{fn: string, postarr: array<string, mixed>}> */
    private array $writes = [];

    /** @var array<int, array{int, string, string}> */
    private array $terms = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->controller = new TemplatesController();

        Functions\when('wp_is_block_theme')->alias(fn(): bool => $this->blockTheme);
        Functions\when('get_stylesheet')->justReturn('twentytwentyfive');
        Functions\when('get_default_block_template_types')->justReturn(['page' => [], 'index' => []]);
        Functions\when('get_block_file_template')->alias(fn(string $id): ?object => $id === 'twentytwentyfive//page-no-title' ? new \stdClass() : null);
        Functions\when('wp_slash')->returnArg();
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('get_post_meta')->alias(fn(int $id): string => ($this->templates[$id]['managed'] ?? false) ? '1' : '');
        Functions\when('get_posts')->alias(fn(array $args): array => $this->query($args));
        Functions\when('get_post')->alias(function (int $id): ?WP_Post {
            $template = $this->templates[$id] ?? null;
            if ($template === null) {
                return null;
            }
            $post               = new WP_Post();
            $post->ID           = $id;
            $post->post_name    = $template['name'];
            $post->post_title   = 'Landing';
            $post->post_content = $template['content'];
            return $post;
        });
        Functions\when('wp_insert_post')->alias(function (array $postarr): int {
            $this->writes[]      = ['fn' => 'insert', 'postarr' => $postarr];
            $this->templates[50] = ['name' => $postarr['post_name'], 'content' => $postarr['post_content'], 'managed' => true, 'theme' => 'twentytwentyfive'];
            return 50;
        });
        Functions\when('wp_update_post')->alias(function (array $postarr): int {
            $this->writes[]                              = ['fn' => 'update', 'postarr' => $postarr];
            $this->templates[$postarr['ID']]['content'] = $postarr['post_content'];
            return $postarr['ID'];
        });
        Functions\when('wp_set_object_terms')->alias(function (int $id, string $term, string $taxonomy): array {
            $this->terms[] = [$id, $term, $taxonomy];
            return [];
        });
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    /**
     * @param array<string, mixed> $args
     * @return int[]
     */
    private function query(array $args): array
    {
        $ids = [];
        foreach ($this->templates as $id => $template) {
            if ($template['theme'] !== $args['tax_query'][0]['terms']) {
                continue;
            }
            if (isset($args['name']) && $template['name'] !== $args['name']) {
                continue;
            }
            if (isset($args['meta_key']) && !$template['managed']) {
                continue;
            }
            $ids[] = $id;
        }
        return $ids;
    }

    private function put(string $slug, string $html = '<!-- wp:post-content /-->'): \WP_REST_Response
    {
        return $this->controller->put_template(new WP_REST_Request(['slug' => $slug, 'title' => 'Landing', 'html' => $html]));
    }

    public function test_creates_a_published_wp_template_tied_to_the_active_theme(): void
    {
        $response = $this->put('landing', '<!-- wp:post-content /-->');

        $this->assertSame(201, $response->status);
        $postarr = $this->writes[0]['postarr'];
        $this->assertSame('insert', $this->writes[0]['fn']);
        $this->assertSame('wp_template', $postarr['post_type']);
        $this->assertSame('landing', $postarr['post_name']);
        $this->assertSame('publish', $postarr['post_status']);
        $this->assertSame('<!-- wp:post-content /-->', $postarr['post_content']);
        $this->assertSame(['_loopress_template' => '1'], $postarr['meta_input']);
        $this->assertSame([[50, 'twentytwentyfive', 'wp_theme']], $this->terms);
        $this->assertSame(['slug' => 'landing', 'title' => 'Landing', 'html' => '<!-- wp:post-content /-->'], $response->get_data());
    }

    public function test_updates_a_managed_template_in_place(): void
    {
        $this->templates[7] = ['name' => 'landing', 'content' => 'old', 'managed' => true, 'theme' => 'twentytwentyfive'];

        $response = $this->put('landing', 'new');

        $this->assertSame(200, $response->status);
        $this->assertSame('update', $this->writes[0]['fn']);
        $this->assertSame(7, $this->writes[0]['postarr']['ID']);
        $this->assertSame('new', $response->get_data()['html']);
    }

    public function test_refuses_a_site_editor_customization_without_writing(): void
    {
        $this->templates[7] = ['name' => 'landing', 'content' => 'mine', 'managed' => false, 'theme' => 'twentytwentyfive'];

        $response = $this->put('landing');

        $this->assertSame(409, $response->status);
        $this->assertStringContainsString('Site Editor', $response->get_data()['error']);
        $this->assertSame([], $this->writes);
    }

    public function test_a_template_of_another_theme_does_not_block_the_push(): void
    {
        $this->templates[7] = ['name' => 'landing', 'content' => 'mine', 'managed' => false, 'theme' => 'twentytwentyfour'];

        $this->assertSame(201, $this->put('landing')->status);
    }

    public function test_refuses_on_a_classic_theme_without_writing(): void
    {
        $this->blockTheme = false;

        $response = $this->put('landing');

        $this->assertSame(409, $response->status);
        $this->assertStringContainsString('not a block theme', $response->get_data()['error']);
        $this->assertSame([], $this->writes);
    }

    public function test_refuses_to_override_a_wordpress_or_theme_template(): void
    {
        foreach (['page', 'page-no-title'] as $slug) {
            $response = $this->put($slug);
            $this->assertSame(409, $response->status);
            $this->assertStringContainsString('only declares custom templates', $response->get_data()['error']);
        }
        $this->assertSame([], $this->writes);
    }

    public function test_refuses_markup_over_the_size_limit(): void
    {
        Functions\when('apply_filters')->alias(fn(string $hook, mixed $value): mixed => $hook === 'loopress_max_file_bytes' ? 4 : $value);

        $response = $this->put('landing', '12345');

        $this->assertSame(413, $response->status);
        $this->assertSame([], $this->writes);
    }

    public function test_refuses_when_the_total_would_exceed_the_cap(): void
    {
        $this->templates[7] = ['name' => 'other', 'content' => '1234', 'managed' => true, 'theme' => 'twentytwentyfive'];
        Functions\when('apply_filters')->alias(fn(string $hook, mixed $value): mixed => $hook === 'loopress_max_files_total_bytes' ? 6 : $value);

        $response = $this->put('landing', '123');

        $this->assertSame(413, $response->status);
        $this->assertSame([], $this->writes);
    }

    public function test_lists_only_managed_templates_of_the_active_theme(): void
    {
        $this->templates[7] = ['name' => 'landing', 'content' => 'a', 'managed' => true, 'theme' => 'twentytwentyfive'];
        $this->templates[8] = ['name' => 'mine', 'content' => 'b', 'managed' => false, 'theme' => 'twentytwentyfive'];
        $this->templates[9] = ['name' => 'old', 'content' => 'c', 'managed' => true, 'theme' => 'twentytwentyfour'];

        $data = $this->controller->list_templates()->get_data();

        $this->assertSame([['slug' => 'landing', 'title' => 'Landing', 'html' => 'a']], $data);
    }
}
