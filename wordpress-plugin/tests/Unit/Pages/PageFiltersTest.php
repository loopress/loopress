<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pages;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Pages\Frontend\PageFilters;
use Loopress\Pages\ManagedPage;
use PHPUnit\Framework\TestCase;
use WP_Post;

class PageFiltersTest extends TestCase
{
    private PageFilters $filters;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->filters = new PageFilters();

        // Post 5 is a managed page, anything else is a regular post.
        Functions\when('get_post_type')->justReturn('page');
        Functions\when('get_post_meta')->alias(fn(int $id, string $key): string => match ([$id, $key]) {
            [5, ManagedPage::MARKER_META] => '1',
            [5, ManagedPage::HTML_META]   => '<section>raw</section>',
            default                       => '',
        });
        Functions\when('__')->returnArg();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_renders_the_meta_html_and_unhooks_wpautop_until_the_end_of_the_run(): void
    {
        Functions\when('get_the_ID')->justReturn(5);
        Functions\when('has_filter')->justReturn(10);
        Functions\expect('remove_filter')->once()->with('the_content', 'wpautop', 10);
        Functions\expect('add_filter')->once()->with('the_content', 'wpautop', 10);

        $this->assertSame('<section>raw</section>', $this->filters->renderContent(''));
        $this->assertSame('rendered', $this->filters->restoreAutop('rendered'));
        // A second run for a regular post must not re-add wpautop again.
        $this->filters->restoreAutop('x');
    }

    public function test_leaves_any_non_empty_content_alone_on_a_managed_page(): void
    {
        // A shortcode inside the page running the_content on its own inner text, or the
        // password form WordPress passes for a protected page: replacing either would recurse
        // or leak the protected HTML.
        Functions\when('get_the_ID')->justReturn(5);
        Functions\expect('remove_filter')->never();

        $this->assertSame('<div>tab body</div>', $this->filters->renderContent('<div>tab body</div>'));
        $this->assertSame('<form class="post-password-form"></form>', $this->filters->renderContent('<form class="post-password-form"></form>'));
    }

    public function test_leaves_regular_posts_untouched(): void
    {
        Functions\when('get_the_ID')->justReturn(6);
        Functions\expect('remove_filter')->never();

        $this->assertSame('', $this->filters->renderContent(''));
    }

    public function test_blocks_edit_post_on_a_managed_page_only(): void
    {
        $this->assertSame(['do_not_allow'], $this->filters->blockEditing(['edit_pages'], 'edit_post', 1, [5]));
        $this->assertSame(['do_not_allow'], $this->filters->blockEditing(['edit_pages'], 'edit_page', 1, [5]));
        $this->assertSame(['edit_pages'], $this->filters->blockEditing(['edit_pages'], 'edit_post', 1, [6]));
        $this->assertSame(['delete_pages'], $this->filters->blockEditing(['delete_pages'], 'delete_post', 1, [5]));
    }

    public function test_adds_the_managed_by_loopress_post_state(): void
    {
        $managed     = new WP_Post();
        $managed->ID = 5;
        $regular     = new WP_Post();
        $regular->ID = 6;

        $this->assertSame(['loopress' => 'Managed by Loopress'], $this->filters->addPostState([], $managed));
        $this->assertSame([], $this->filters->addPostState([], $regular));
    }
}
