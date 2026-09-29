<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pages;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Pages\RestApi\ChildThemeController;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;
use WP_REST_Request;

class ChildThemeControllerTest extends TestCase
{
    private string $root;
    private string $stylesheet = 'twentytwentyfive';
    private string $template   = 'twentytwentyfive';
    private bool $blockTheme   = true;

    /** @var array<string, array<int, object>> */
    private array $blockTemplates = ['wp_template' => [], 'wp_template_part' => []];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->root = sys_get_temp_dir() . '/lps-child-theme-' . uniqid();
        (new Filesystem())->dumpFile("{$this->root}/twentytwentyfive/theme.json", (string) json_encode([
            'version'         => 3,
            'customTemplates' => [['name' => 'page-no-title', 'title' => 'Page No Title']],
            'templateParts'   => [['name' => 'header', 'title' => 'Header', 'area' => 'header'], ['name' => 'footer-newsletter', 'area' => 'footer']],
        ]));

        Functions\when('wp_is_block_theme')->alias(fn(): bool => $this->blockTheme);
        Functions\when('get_stylesheet')->alias(fn(): string => $this->stylesheet);
        Functions\when('get_template')->alias(fn(): string => $this->template);
        Functions\when('wp_get_theme')->justReturn(new class() {
            public function get(string $header): string
            {
                return $header === 'Name' ? 'Twenty Twenty-Five' : '';
            }
        });
        Functions\when('wp_json_encode')->alias(fn(mixed $data, int $flags = 0): string|false => json_encode($data, $flags));
        Functions\when('wp_clean_themes_cache')->justReturn(null);
        Functions\when('get_block_templates')->alias(fn(array $query, string $type): array => $this->blockTemplates[$type]);
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove($this->root);
        Monkey\tearDown();
        parent::tearDown();
    }

    private function controller(): ChildThemeController
    {
        return new ChildThemeController($this->root);
    }

    /**
     * @param array<int, array<string, mixed>> $templates
     * @param array<int, array<string, mixed>> $parts
     */
    private function put(array $templates, array $parts = []): \WP_REST_Response
    {
        return $this->controller()->put_child_theme(new WP_REST_Request(['templates' => $templates, 'parts' => $parts]));
    }

    private function child(string $file): string
    {
        return (string) file_get_contents("{$this->root}/twentytwentyfive-loopress/{$file}");
    }

    public function test_writes_a_child_theme_of_the_active_block_theme(): void
    {
        $response = $this->put(
            [['slug' => 'single', 'html' => '<!-- wp:post-content /-->'], ['slug' => 'bare-landing', 'html' => 'bare', 'title' => 'Bare landing', 'postTypes' => ['page']]],
            [['slug' => 'header', 'html' => 'head', 'title' => 'Header', 'area' => 'header']]
        );

        $this->assertSame(200, $response->status);
        $this->assertStringContainsString("Theme Name: Twenty Twenty-Five Loopress\nTemplate: twentytwentyfive\n", $this->child('style.css'));
        $this->assertSame('<!-- wp:post-content /-->', $this->child('templates/single.html'));
        $this->assertSame('head', $this->child('parts/header.html'));

        $data = $response->get_data();
        $this->assertSame('twentytwentyfive-loopress', $data['stylesheet']);
        $this->assertTrue($data['exists']);
        $this->assertFalse($data['active']);
        $this->assertSame([
            ['slug' => 'bare-landing', 'html' => 'bare', 'title' => 'Bare landing', 'postTypes' => ['page']],
            ['slug' => 'single', 'html' => '<!-- wp:post-content /-->'],
        ], $data['templates']);
        $this->assertSame([['slug' => 'header', 'html' => 'head', 'title' => 'Header', 'area' => 'header']], $data['parts']);
    }

    public function test_theme_json_keeps_the_parent_entries_and_ours_win_on_the_same_name(): void
    {
        $this->put(
            [['slug' => 'bare-landing', 'html' => 'x', 'title' => 'Bare landing'], ['slug' => 'single', 'html' => 'x']],
            [['slug' => 'header', 'html' => 'x', 'title' => 'Site header', 'area' => 'header']]
        );

        $json = json_decode($this->child('theme.json'), true);
        $this->assertSame(3, $json['version']);
        $this->assertSame([['name' => 'page-no-title', 'title' => 'Page No Title'], ['name' => 'bare-landing', 'title' => 'Bare landing']], $json['customTemplates']);
        $this->assertSame([
            ['name' => 'footer-newsletter', 'area' => 'footer'],
            ['name' => 'header', 'title' => 'Site header', 'area' => 'header'],
        ], $json['templateParts']);
    }

    public function test_a_push_mirrors_the_repository_and_removes_files_gone_from_it(): void
    {
        $this->put([['slug' => 'single', 'html' => 'a'], ['slug' => 'archive', 'html' => 'b']]);
        $this->put([['slug' => 'single', 'html' => 'a2']]);

        $this->assertSame('a2', $this->child('templates/single.html'));
        $this->assertFileDoesNotExist("{$this->root}/twentytwentyfive-loopress/templates/archive.html");
        $this->assertEmpty(glob("{$this->root}/.*-staging"));
        $this->assertEmpty(glob("{$this->root}/.*-old"));
    }

    public function test_an_active_child_is_rewritten_for_its_parent_and_reports_site_editor_edits(): void
    {
        $this->put([['slug' => 'single', 'html' => 'a']]);
        $this->stylesheet     = 'twentytwentyfive-loopress';
        $this->blockTemplates = [
            'wp_template'      => [(object) ['slug' => 'single', 'wp_id' => 12], (object) ['slug' => 'index', 'wp_id' => null]],
            'wp_template_part' => [(object) ['slug' => 'header', 'wp_id' => 13]],
        ];

        $data = $this->controller()->get_child_theme()->get_data();

        $this->assertSame('twentytwentyfive', $data['parent']);
        $this->assertTrue($data['active']);
        $this->assertSame(['parts/header', 'templates/single'], $data['customized']);
    }

    public function test_refuses_a_classic_theme(): void
    {
        $this->blockTheme = false;

        $response = $this->put([['slug' => 'single', 'html' => 'a']]);

        $this->assertSame(409, $response->status);
        $this->assertStringContainsString('not a block theme', $response->get_data()['error']);
        $this->assertDirectoryDoesNotExist("{$this->root}/twentytwentyfive-loopress");
    }

    public function test_refuses_when_another_child_theme_is_active(): void
    {
        $this->stylesheet = 'my-child';

        $response = $this->put([['slug' => 'single', 'html' => 'a']]);

        $this->assertSame(409, $response->status);
        $this->assertStringContainsString('no grandchild themes', $response->get_data()['error']);
    }

    public function test_refuses_markup_over_the_size_limit_without_writing(): void
    {
        Functions\when('apply_filters')->alias(fn(string $hook, mixed $value): mixed => $hook === 'loopress_max_file_bytes' ? 4 : $value);

        $response = $this->put([['slug' => 'single', 'html' => '12345']]);

        $this->assertSame(413, $response->status);
        $this->assertDirectoryDoesNotExist("{$this->root}/twentytwentyfive-loopress");
    }

    public function test_describes_a_child_that_does_not_exist_yet(): void
    {
        $data = $this->controller()->get_child_theme()->get_data();

        $this->assertFalse($data['exists']);
        $this->assertSame([], $data['templates']);
        $this->assertSame([], $data['parts']);
    }
}
