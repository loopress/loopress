<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Infrastructure\AmbiguousPostSlugException;
use Loopress\Infrastructure\PostByPath;
use PHPUnit\Framework\TestCase;
use WP_Post;

class PostByPathTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('is_post_type_hierarchical')->alias(static fn (string $type): bool => $type === 'page');
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_find_returns_the_post_at_the_full_path_without_a_fallback_query(): void
    {
        $profile = $this->post(7, 'profile');
        Functions\expect('get_page_by_path')->once()->with('account/profile', OBJECT, 'page')->andReturn($profile);
        Functions\expect('get_posts')->never();

        $this->assertSame($profile, PostByPath::find('account/profile', 'page'));
    }

    // The NFT bug: a menu or SEO file holding `profile` for the child page `account/profile`.
    public function test_find_falls_back_to_the_only_post_with_that_slug(): void
    {
        $profile = $this->post(7, 'profile');
        Functions\when('get_page_by_path')->justReturn(null);
        Functions\expect('get_posts')->once()->andReturnUsing(function (array $args) use ($profile): array {
            $this->assertSame('profile', $args['name']);
            $this->assertSame('page', $args['post_type']);

            return [$profile];
        });

        $this->assertSame($profile, PostByPath::find('profile', 'page'));
    }

    public function test_find_refuses_to_pick_between_several_posts_with_that_slug(): void
    {
        Functions\when('get_page_by_path')->justReturn(null);
        Functions\when('get_posts')->justReturn([$this->post(7, 'profile'), $this->post(8, 'profile')]);
        Functions\when('get_page_uri')->alias(static fn (WP_Post $post): string => $post->ID === 7 ? 'account/profile' : 'team/profile');

        $this->expectException(AmbiguousPostSlugException::class);
        $this->expectExceptionMessage('account/profile, team/profile');

        PostByPath::find('profile', 'page');
    }

    public function test_find_returns_null_when_nothing_matches(): void
    {
        Functions\when('get_page_by_path')->justReturn(null);
        Functions\when('get_posts')->justReturn([]);

        $this->assertNull(PostByPath::find('ghost', 'page'));
    }

    // A full path is already exact: falling back on its last segment could land on another page.
    public function test_find_does_not_fall_back_for_a_full_path_that_misses(): void
    {
        Functions\when('get_page_by_path')->justReturn(null);
        Functions\expect('get_posts')->never();

        $this->assertNull(PostByPath::find('account/profile', 'page'));
    }

    public function test_path_of_is_the_full_path_for_a_hierarchical_post(): void
    {
        Functions\when('get_page_uri')->justReturn('account/profile');

        $this->assertSame('account/profile', PostByPath::pathOf($this->post(7, 'profile', 'page')));
    }

    public function test_path_of_is_the_slug_for_a_flat_post(): void
    {
        Functions\expect('get_page_uri')->never();

        $this->assertSame('hello', PostByPath::pathOf($this->post(9, 'hello', 'post')));
    }

    private function post(int $id, string $slug, string $postType = 'page'): WP_Post
    {
        $post            = new WP_Post();
        $post->ID        = $id;
        $post->post_name = $slug;
        $post->post_type = $postType;

        return $post;
    }
}
