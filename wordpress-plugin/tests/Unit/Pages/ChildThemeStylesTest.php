<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pages;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Pages\Frontend\ChildThemeStyles;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;

class ChildThemeStylesTest extends TestCase
{
    private string $dir;
    private string $stylesheet = 'twentytwentyfive-loopress';

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->dir = sys_get_temp_dir() . '/lps-child-styles-' . uniqid();
        $filesystem = new Filesystem();
        $filesystem->dumpFile("{$this->dir}/style.css", '/* header */');
        $filesystem->dumpFile("{$this->dir}/blocks/core/button.css", '.a{}');
        $filesystem->dumpFile("{$this->dir}/blocks/woocommerce/product-price.css", '.b{}');

        Functions\when('get_stylesheet')->alias(fn(): string => $this->stylesheet);
        Functions\when('get_template')->justReturn('twentytwentyfive');
        Functions\when('get_stylesheet_directory')->alias(fn(): string => $this->dir);
        Functions\when('get_stylesheet_directory_uri')->justReturn('https://site.test/wp-content/themes/twentytwentyfive-loopress');
        Functions\when('get_stylesheet_uri')->justReturn('https://site.test/wp-content/themes/twentytwentyfive-loopress/style.css');
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove($this->dir);
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_enqueues_style_css_inlinable_and_versioned_by_mtime(): void
    {
        $path = "{$this->dir}/style.css";
        Functions\expect('wp_enqueue_style')->once()->with(ChildThemeStyles::HANDLE, 'https://site.test/wp-content/themes/twentytwentyfive-loopress/style.css', [], (string) filemtime($path));
        Functions\expect('wp_style_add_data')->once()->with(ChildThemeStyles::HANDLE, 'path', $path);

        (new ChildThemeStyles())->enqueueStyle();
        $this->addToAssertionCount(1);
    }

    public function test_enqueues_one_block_style_per_file(): void
    {
        $calls = [];
        Functions\when('wp_enqueue_block_style')->alias(static function (string $name, array $args) use (&$calls): void {
            $calls[$name] = $args;
        });

        (new ChildThemeStyles())->enqueueBlockStyles();

        $this->assertSame(['core/button', 'woocommerce/product-price'], array_keys($calls));
        $this->assertSame('loopress-block-woocommerce-product-price', $calls['woocommerce/product-price']['handle']);
        $this->assertSame('https://site.test/wp-content/themes/twentytwentyfive-loopress/blocks/core/button.css', $calls['core/button']['src']);
        $this->assertSame("{$this->dir}/blocks/core/button.css", $calls['core/button']['path']);
    }

    public function test_adds_the_editor_style(): void
    {
        Functions\expect('add_editor_style')->once()->with('style.css');

        (new ChildThemeStyles())->addEditorStyle();
        $this->addToAssertionCount(1);
    }

    public function test_does_nothing_unless_the_loopress_child_is_active(): void
    {
        foreach (['twentytwentyfive', 'my-child'] as $stylesheet) {
            $this->stylesheet = $stylesheet;
            Functions\expect('wp_enqueue_style')->never();
            Functions\expect('wp_enqueue_block_style')->never();
            Functions\expect('add_editor_style')->never();

            $styles = new ChildThemeStyles();
            $styles->enqueueStyle();
            $styles->enqueueBlockStyles();
            $styles->addEditorStyle();
        }
        $this->addToAssertionCount(1);
    }
}
