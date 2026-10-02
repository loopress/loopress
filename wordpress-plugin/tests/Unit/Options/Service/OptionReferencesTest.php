<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Options\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Options\Exception\UnresolvedOptionReferenceException;
use Loopress\Options\Service\OptionReferences;
use PHPUnit\Framework\TestCase;
use WP_Post;

class OptionReferencesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('is_post_type_hierarchical')->alias(static fn (string $type): bool => $type === 'page');
        Functions\when('get_page_uri')->alias(static fn (WP_Post $post): string => $post->ID === 7 ? 'account/checkout' : $post->post_name);
        Functions\when('get_posts')->justReturn([]);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // The EDD case: page IDs as keys of one serialized settings array.
    public function test_to_paths_rewrites_each_declared_key_and_leaves_the_rest(): void
    {
        Functions\when('get_post')->alias(fn (int $id): ?WP_Post => $id === 7 ? $this->post(7, 'checkout') : null);

        $value = OptionReferences::toPaths(['purchase_page' => '7', 'currency' => 'EUR'], ['purchase_page' => 'page']);

        $this->assertSame(['purchase_page' => 'account/checkout', 'currency' => 'EUR'], $value);
    }

    public function test_to_paths_follows_a_dot_path_and_the_root_marker(): void
    {
        Functions\when('get_post')->alias(fn (int $id): WP_Post => $this->post($id, 'shop'));

        $this->assertSame(['checkout' => ['page' => 'shop']], OptionReferences::toPaths(['checkout' => ['page' => 3]], ['checkout.page' => 'page']));
        $this->assertSame('shop', OptionReferences::toPaths(3, [OptionReferences::ROOT => 'page']));
    }

    public function test_to_paths_passes_an_unset_or_missing_reference_through(): void
    {
        Functions\expect('get_post')->never();

        $this->assertSame(['purchase_page' => 0, 'success_page' => ''], OptionReferences::toPaths(
            ['purchase_page' => 0, 'success_page' => ''],
            ['purchase_page' => 'page', 'success_page' => 'page', 'failure_page' => 'page'],
        ));
    }

    public function test_to_paths_refuses_an_id_that_does_not_exist_here(): void
    {
        Functions\when('get_post')->justReturn(null);

        $this->expectException(UnresolvedOptionReferenceException::class);
        $this->expectExceptionMessage('"purchase_page" holds "page" ID 99');

        OptionReferences::toPaths(['purchase_page' => 99], ['purchase_page' => 'page']);
    }

    public function test_to_paths_refuses_an_id_of_another_post_type(): void
    {
        Functions\when('get_post')->alias(fn (int $id): WP_Post => $this->post($id, 'logo', 'attachment'));

        $this->expectException(UnresolvedOptionReferenceException::class);

        OptionReferences::toPaths(['purchase_page' => 5], ['purchase_page' => 'page']);
    }

    public function test_to_ids_resolves_each_path_on_this_environment(): void
    {
        Functions\when('get_page_by_path')->alias(fn (string $path): ?WP_Post => $path === 'account/checkout' ? $this->post(41, 'checkout') : null);

        $value = OptionReferences::toIds(['purchase_page' => 'account/checkout', 'success_page' => 0], ['purchase_page' => 'page', 'success_page' => 'page']);

        $this->assertSame(['purchase_page' => 41, 'success_page' => 0], $value);
    }

    // An ID copied from another environment is the bug refs exist for: never pushed as is.
    public function test_to_ids_refuses_a_raw_id(): void
    {
        Functions\expect('get_page_by_path')->never();

        $this->expectException(UnresolvedOptionReferenceException::class);
        $this->expectExceptionMessage('lps option pull');

        OptionReferences::toIds(['purchase_page' => '12'], ['purchase_page' => 'page']);
    }

    public function test_to_ids_refuses_a_path_that_does_not_exist_here(): void
    {
        Functions\when('get_page_by_path')->justReturn(null);

        $this->expectException(UnresolvedOptionReferenceException::class);
        $this->expectExceptionMessage('"purchase_page" points to "page" "checkout"');

        OptionReferences::toIds(['purchase_page' => 'checkout'], ['purchase_page' => 'page']);
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
