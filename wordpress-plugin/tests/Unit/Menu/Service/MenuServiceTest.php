<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Menu\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Menu\Service\MenuService;
use PHPUnit\Framework\TestCase;
use WP_Post;
use WP_Term;

class MenuServiceTest extends TestCase
{
    private MenuService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->service = new MenuService();

        Functions\when('is_wp_error')->alias(fn(mixed $thing): bool => $thing instanceof \WP_Error);
        Functions\when('wp_parse_url')->alias('parse_url');
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── export (read) ──────────────────────────────────────────────────────

    public function test_get_menu_returns_null_when_no_menu_matches_the_slug(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn(false);

        $this->assertNull($this->service->getMenu('missing'));
    }

    public function test_get_menu_builds_a_nested_tree_from_flat_items_by_parent(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(5, 'main', 'Main Menu'));

        $custom = $this->fakeItemPost(1, '', '', 1);
        $child  = $this->fakeItemPost(2, 'About', '', 2);
        Functions\when('wp_get_nav_menu_items')->justReturn([$custom, $child]);

        $this->stubItemMeta([
            1 => ['_menu_item_type' => 'custom', '_menu_item_url' => '/custom', '_menu_item_menu_item_parent' => '0'],
            2 => [
                '_menu_item_type'             => 'post_type',
                '_menu_item_object'           => 'page',
                '_menu_item_object_id'        => '42',
                '_menu_item_menu_item_parent' => '1',
            ],
        ]);
        Functions\when('get_post')->justReturn($this->fakePost(42, 'about', 'About', 'page'));

        $menu = $this->service->getMenu('main');

        $this->assertSame('main', $menu['slug']);
        $this->assertSame('Main Menu', $menu['name']);
        $this->assertSame([], $menu['warnings']);
        $this->assertCount(1, $menu['items']);
        $this->assertSame('custom', $menu['items'][0]['type']);
        $this->assertSame('/custom', $menu['items'][0]['url']);
        $this->assertCount(1, $menu['items'][0]['children']);
        $this->assertSame('page', $menu['items'][0]['children'][0]['object']);
        $this->assertSame('about', $menu['items'][0]['children'][0]['objectSlug']);
    }

    public function test_get_menu_skips_a_dangling_post_type_item_and_warns(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(5, 'main', 'Main Menu'));
        Functions\when('wp_get_nav_menu_items')->justReturn([$this->fakeItemPost(1, '', '', 1)]);
        $this->stubItemMeta([
            1 => [
                '_menu_item_type'             => 'post_type',
                '_menu_item_object'           => 'page',
                '_menu_item_object_id'        => '999',
                '_menu_item_menu_item_parent' => '0',
            ],
        ]);
        Functions\when('get_post')->justReturn(null);

        $menu = $this->service->getMenu('main');

        $this->assertSame([], $menu['items']);
        $this->assertCount(1, $menu['warnings']);
        $this->assertStringContainsString('999', $menu['warnings'][0]);
    }

    public function test_get_menu_skips_an_unsupported_item_type_and_warns(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(5, 'main', 'Main Menu'));
        Functions\when('wp_get_nav_menu_items')->justReturn([$this->fakeItemPost(1, '', '', 1)]);
        $this->stubItemMeta([1 => ['_menu_item_type' => 'post_type_archive', '_menu_item_menu_item_parent' => '0']]);

        $menu = $this->service->getMenu('main');

        $this->assertSame([], $menu['items']);
        $this->assertStringContainsString('post_type_archive', $menu['warnings'][0]);
    }

    // wp_update_nav_menu_item() writes menu-item-description to post_content, not post_excerpt.
    public function test_get_menu_reads_the_description_from_post_content(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(5, 'main', 'Main Menu'));
        Functions\when('wp_get_nav_menu_items')->justReturn([$this->fakeItemPost(1, '', 'A description', 1)]);
        $this->stubItemMeta([1 => ['_menu_item_type' => 'custom', '_menu_item_url' => '/x', '_menu_item_menu_item_parent' => '0']]);

        $menu = $this->service->getMenu('main');

        $this->assertSame('A description', $menu['items'][0]['description']);
    }

    // wp_update_nav_menu_item() stores _menu_item_classes as one array element per class, not a
    // single joined string; every class must survive the round trip, not just the first.
    public function test_get_menu_preserves_every_menu_item_class(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(5, 'main', 'Main Menu'));
        Functions\when('wp_get_nav_menu_items')->justReturn([$this->fakeItemPost(1, '', '', 1)]);
        $this->stubItemMeta([
            1 => [
                '_menu_item_type'             => 'custom',
                '_menu_item_url'              => '/x',
                '_menu_item_classes'          => ['class-a', 'class-b'],
                '_menu_item_menu_item_parent' => '0',
            ],
        ]);

        $menu = $this->service->getMenu('main');

        $this->assertSame(['class-a', 'class-b'], $menu['items'][0]['classes']);
    }

    // A supported item whose direct parent has an unsupported type must not become unreachable
    // from the exported tree just because its parent was skipped.
    public function test_get_menu_reparents_a_supported_item_under_a_skipped_parent(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(5, 'main', 'Main Menu'));
        $skippedParent = $this->fakeItemPost(1, '', '', 1);
        $child         = $this->fakeItemPost(2, '', '', 1);
        Functions\when('wp_get_nav_menu_items')->justReturn([$skippedParent, $child]);
        $this->stubItemMeta([
            1 => ['_menu_item_type' => 'post_type_archive', '_menu_item_menu_item_parent' => '0'],
            2 => ['_menu_item_type' => 'custom', '_menu_item_url' => '/child', '_menu_item_menu_item_parent' => '1'],
        ]);

        $menu = $this->service->getMenu('main');

        $this->assertCount(1, $menu['items'], 'the child must surface at the top level, not be lost');
        $this->assertSame('/child', $menu['items'][0]['url']);
    }

    public function test_list_menus_exports_every_menu(): void
    {
        Functions\when('wp_get_nav_menus')->justReturn([$this->fakeTerm(1, 'main', 'Main'), $this->fakeTerm(2, 'footer', 'Footer')]);
        Functions\when('wp_get_nav_menu_items')->justReturn([]);

        $result = $this->service->listMenus();

        $this->assertCount(2, $result);
        $this->assertSame('main', $result[0]['slug']);
        $this->assertSame('footer', $result[1]['slug']);
    }

    // ── upsert (write) ────────────────────────────────────────────────────

    // resolveItems() runs before any menu lookup or write, so none of these need a
    // wp_get_nav_menu_object/wp_insert_term stub at all: reaching them would itself be a bug.
    public function test_upsert_menu_throws_before_any_write_when_a_post_type_item_does_not_resolve(): void
    {
        Functions\when('get_page_by_path')->justReturn(false);
        $updateCalled = false;
        Functions\when('wp_update_nav_menu_item')->alias(function () use (&$updateCalled) {
            $updateCalled = true;
            return 1;
        });

        try {
            $this->service->upsertMenu('main', 'Main', [['object' => 'page', 'objectSlug' => 'ghost', 'type' => 'post_type']]);
            $this->fail('Expected a RuntimeException');
        } catch (\RuntimeException) {
            $this->assertFalse($updateCalled, 'no item should be written when resolution fails');
        }
    }

    public function test_upsert_menu_throws_before_any_write_when_a_taxonomy_item_does_not_resolve(): void
    {
        Functions\when('get_term_by')->justReturn(false);

        $this->expectException(\RuntimeException::class);
        $this->service->upsertMenu('main', 'Main', [['object' => 'category', 'objectSlug' => 'ghost', 'type' => 'taxonomy']]);
    }

    public function test_upsert_menu_rejects_an_unsupported_item_type(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->service->upsertMenu('main', 'Main', [['type' => 'post_type_archive']]);
    }

    public function test_upsert_menu_creates_a_new_menu_with_an_explicit_slug_when_none_exists(): void
    {
        $capture = $this->installFreshMenuCreation(10);
        Functions\when('wp_get_nav_menu_items')->justReturn([]);

        $this->service->upsertMenu('main', 'Main Menu', []);

        $this->assertSame('main', $capture->insertedArgs['slug']);
        $this->assertSame('Main Menu', $capture->insertedName);
    }

    public function test_upsert_menu_renames_an_existing_menu_without_changing_its_slug(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(10, 'main', 'Old Name'));
        Functions\when('wp_get_nav_menu_items')->justReturn([]);

        $renamed = null;
        Functions\when('wp_update_term')->alias(function (int $termId, string $taxonomy, array $args) use (&$renamed) {
            $renamed = $args;
            return ['term_id' => $termId];
        });

        $this->service->upsertMenu('main', 'New Name', []);

        $this->assertSame(['name' => 'New Name'], $renamed);
    }

    public function test_upsert_menu_does_not_rename_when_the_name_is_unchanged(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(10, 'main', 'Main Menu'));
        Functions\when('wp_get_nav_menu_items')->justReturn([]);
        $renameCalled = false;
        Functions\when('wp_update_term')->alias(function () use (&$renameCalled) {
            $renameCalled = true;
            return ['term_id' => 10];
        });

        $this->service->upsertMenu('main', 'Main Menu', []);

        $this->assertFalse($renameCalled);
    }

    public function test_upsert_menu_creates_items_top_down_so_children_reference_the_real_new_parent_id(): void
    {
        $this->installFreshMenuCreation(10);
        Functions\when('wp_get_nav_menu_items')->justReturn([]);
        Functions\when('get_page_by_path')->justReturn($this->fakePost(42, 'about', 'About', 'page'));

        $calls  = [];
        $nextId = 100;
        Functions\when('wp_update_nav_menu_item')->alias(function (int $menuId, int $itemId, array $args) use (&$calls, &$nextId) {
            $calls[] = $args;
            return $nextId++;
        });

        $this->service->upsertMenu('main', 'Main', [
            [
                'children'   => [['type' => 'custom', 'url' => '/child']],
                'object'     => 'page',
                'objectSlug' => 'about',
                'type'       => 'post_type',
            ],
        ]);

        $this->assertCount(2, $calls);
        $this->assertSame(0, $calls[0]['menu-item-parent-id']);
        $this->assertSame(42, $calls[0]['menu-item-object-id']);
        $this->assertSame(100, $calls[1]['menu-item-parent-id']);
        $this->assertSame('/child', $calls[1]['menu-item-url']);
    }

    public function test_upsert_menu_deletes_every_existing_item_once_the_replacement_is_written(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(10, 'main', 'Main'));
        Functions\when('wp_get_nav_menu_items')->justReturn([$this->fakeItemPost(1, '', '', 1), $this->fakeItemPost(2, '', '', 2)]);
        $this->stubItemMeta([1 => [], 2 => []]);

        $deleted = [];
        Functions\when('wp_delete_post')->alias(function (int $id) use (&$deleted): bool {
            $deleted[] = $id;

            return true;
        });

        $this->service->upsertMenu('main', 'Main', []);

        $this->assertSame([1, 2], $deleted);
    }

    // The new items are created before the old ones are deleted (see replaceItems()'s own
    // docblock): if wp_update_nav_menu_item() ever fails partway, the original items must still
    // be there to fail back to, not already gone.
    public function test_upsert_menu_creates_the_replacement_before_deleting_the_originals(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(10, 'main', 'Main'));
        Functions\when('wp_get_nav_menu_items')->justReturn([$this->fakeItemPost(1, '', '', 1)]);
        $this->stubItemMeta([1 => []]);

        $calls = [];
        Functions\when('wp_update_nav_menu_item')->alias(function () use (&$calls) {
            $calls[] = 'create';
            return 100;
        });
        Functions\when('wp_delete_post')->alias(function () use (&$calls): bool {
            $calls[] = 'delete';

            return true;
        });

        $this->service->upsertMenu('main', 'Main', [['type' => 'custom', 'url' => '/x']]);

        $this->assertSame(['create', 'delete'], $calls);
    }

    // Regression coverage for a real data-loss risk: wp_update_nav_menu_item() failing on item 2
    // of 2, after item 1 already succeeded, must not leave the menu half-migrated. The original
    // item (id 1) is never deleted, and the one new item already created (id 100) is rolled back.
    public function test_upsert_menu_rolls_back_partially_created_items_and_keeps_the_originals_when_a_later_item_fails(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(10, 'main', 'Main'));
        Functions\when('wp_get_nav_menu_items')->justReturn([$this->fakeItemPost(1, '', '', 1)]);
        $this->stubItemMeta([1 => []]);

        $calls = [];
        $callCount = 0;
        Functions\when('wp_update_nav_menu_item')->alias(function () use (&$calls, &$callCount) {
            $callCount++;
            if ($callCount === 2) {
                return new \WP_Error('fail', 'boom');
            }

            $calls[] = ['create', 100];
            return 100;
        });
        Functions\when('wp_delete_post')->alias(function (int $id) use (&$calls): void {
            $calls[] = ['delete', $id];
        });

        try {
            $this->service->upsertMenu('main', 'Main', [
                ['type' => 'custom', 'url' => '/a'],
                ['type' => 'custom', 'url' => '/b'],
            ]);
            $this->fail('Expected a RuntimeException');
        } catch (\RuntimeException) {
            $this->assertSame([['create', 100], ['delete', 100]], $calls);
        }
    }

    // wp_update_nav_menu_item() returns int 0, not just WP_Error, when it fails to insert the
    // post; treating 0 as a valid id would use it as the parent for the item's children and let
    // replaceItems() go on to delete the originals after a replacement that never really happened.
    public function test_upsert_menu_treats_a_zero_item_id_as_a_creation_failure(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(10, 'main', 'Main'));
        Functions\when('wp_get_nav_menu_items')->justReturn([$this->fakeItemPost(1, '', '', 1)]);
        $this->stubItemMeta([1 => []]);

        Functions\when('wp_update_nav_menu_item')->justReturn(0);
        $deleted = false;
        Functions\when('wp_delete_post')->alias(function () use (&$deleted): bool {
            $deleted = true;

            return true;
        });

        try {
            $this->service->upsertMenu('main', 'Main', [['type' => 'custom', 'url' => '/a']]);
            $this->fail('Expected a RuntimeException');
        } catch (\RuntimeException) {
            $this->assertFalse($deleted, 'the original item must not be deleted after a failed create');
        }
    }

    // wp_delete_post() can return false or null on failure, not just a deleted WP_Post. Ignoring
    // that would let upsertMenu() report success while the original item is still there
    // alongside its freshly created replacement.
    public function test_upsert_menu_fails_when_deleting_an_original_item_fails(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(10, 'main', 'Main'));
        Functions\when('wp_get_nav_menu_items')->justReturn([$this->fakeItemPost(1, '', '', 1)]);
        $this->stubItemMeta([1 => []]);

        Functions\when('wp_update_nav_menu_item')->justReturn(100);
        Functions\when('wp_delete_post')->justReturn(false);

        $this->expectException(\RuntimeException::class);

        $this->service->upsertMenu('main', 'Main', [['type' => 'custom', 'url' => '/a']]);
    }

    // Warned, never blocked: unlike RankMathService's redirect guard, a menu is allowed to link
    // off-site, this is only a nudge to double-check before syncing the same menu elsewhere.
    public function test_upsert_menu_warns_but_does_not_block_a_custom_item_pointing_off_environment(): void
    {
        $this->installFreshMenuCreation(10);
        Functions\when('wp_get_nav_menu_items')->justReturn([]);
        Functions\when('home_url')->justReturn('https://this-site.example');
        Functions\when('wp_update_nav_menu_item')->justReturn(1);

        $menu = $this->service->upsertMenu('main', 'Main', [['type' => 'custom', 'url' => 'https://other-site.example/x']]);

        $this->assertNotEmpty($menu['warnings']);
        $this->assertStringContainsString('other-site.example', $menu['warnings'][0]);
    }

    public function test_upsert_menu_does_not_warn_for_a_same_site_absolute_custom_url(): void
    {
        $this->installFreshMenuCreation(10);
        Functions\when('wp_get_nav_menu_items')->justReturn([]);
        Functions\when('home_url')->justReturn('https://this-site.example');
        Functions\when('wp_update_nav_menu_item')->justReturn(1);

        $menu = $this->service->upsertMenu('main', 'Main', [['type' => 'custom', 'url' => 'https://this-site.example/x']]);

        $this->assertSame([], $menu['warnings']);
    }

    public function test_delete_menu_returns_false_when_not_found(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn(false);

        $this->assertFalse($this->service->deleteMenu('missing'));
    }

    public function test_delete_menu_deletes_by_term_id_and_returns_true(): void
    {
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(10, 'main', 'Main'));
        Functions\when('wp_delete_nav_menu')->alias(fn(int $id) => $id === 10);

        $this->assertTrue($this->service->deleteMenu('main'));
    }

    // ── locations ───────────────────────────────────────────────────────────

    public function test_get_locations_includes_every_registered_location_and_resolves_assigned_slugs(): void
    {
        Functions\when('get_registered_nav_menus')->justReturn(['footer' => 'Footer', 'primary' => 'Primary']);
        Functions\when('get_nav_menu_locations')->justReturn(['primary' => 10]);
        Functions\when('wp_get_nav_menu_object')->alias(fn(int|string $id) => $id === 10 ? $this->fakeTerm(10, 'main', 'Main') : false);

        $locations = $this->service->getLocations();

        $this->assertSame(['footer' => null, 'primary' => 'main'], $locations);
    }

    public function test_set_locations_rejects_an_unregistered_location(): void
    {
        Functions\when('get_registered_nav_menus')->justReturn(['primary' => 'Primary']);
        Functions\when('get_nav_menu_locations')->justReturn([]);

        $this->expectException(\RuntimeException::class);
        $this->service->setLocations(['sidebar' => 'main']);
    }

    public function test_set_locations_rejects_a_slug_with_no_matching_menu(): void
    {
        Functions\when('get_registered_nav_menus')->justReturn(['primary' => 'Primary']);
        Functions\when('get_nav_menu_locations')->justReturn([]);
        Functions\when('wp_get_nav_menu_object')->justReturn(false);

        $this->expectException(\RuntimeException::class);
        $this->service->setLocations(['primary' => 'ghost']);
    }

    public function test_set_locations_unassigns_a_location_mapped_to_null(): void
    {
        Functions\when('get_registered_nav_menus')->justReturn(['primary' => 'Primary']);
        Functions\when('get_nav_menu_locations')->justReturn(['primary' => 10]);
        Functions\when('wp_get_nav_menu_object')->justReturn(false);

        $stored = null;
        Functions\when('set_theme_mod')->alias(function (string $name, mixed $value) use (&$stored): void {
            $stored = $value;
        });

        $this->service->setLocations(['primary' => null]);

        $this->assertSame([], $stored);
    }

    public function test_set_locations_resolves_the_slug_to_a_term_id_and_persists_via_theme_mod(): void
    {
        Functions\when('get_registered_nav_menus')->justReturn(['primary' => 'Primary']);
        Functions\when('get_nav_menu_locations')->justReturn([]);
        Functions\when('wp_get_nav_menu_object')->justReturn($this->fakeTerm(10, 'main', 'Main'));

        $stored = null;
        Functions\when('set_theme_mod')->alias(function (string $name, mixed $value) use (&$stored): void {
            $stored = $value;
        });

        $this->service->setLocations(['primary' => 'main']);

        $this->assertSame(['primary' => 10], $stored);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private function fakeTerm(int $id, string $slug, string $name): WP_Term
    {
        $term           = new WP_Term();
        $term->term_id  = $id;
        $term->slug     = $slug;
        $term->name     = $name;
        $term->taxonomy = 'nav_menu';

        return $term;
    }

    private function fakePost(int $id, string $slug, string $title, string $postType = 'post'): WP_Post
    {
        $post             = new WP_Post();
        $post->ID         = $id;
        $post->post_name  = $slug;
        $post->post_title = $title;
        $post->post_type  = $postType;
        $post->post_status = 'publish';

        return $post;
    }

    private function fakeItemPost(int $id, string $title, string $content, int $menuOrder): WP_Post
    {
        $post              = new WP_Post();
        $post->ID          = $id;
        $post->post_title  = $title;
        $post->post_content = $content;
        $post->menu_order  = $menuOrder;
        $post->post_type   = 'nav_menu_item';

        return $post;
    }

    /** @param array<int, array<string, mixed>> $metaByPostId */
    private function stubItemMeta(array $metaByPostId): void
    {
        Functions\when('get_post_meta')->alias(
            fn(int $postId, string $key = ''): mixed => $metaByPostId[$postId][$key] ?? '',
        );
    }

    // Wires wp_get_nav_menu_object() to report "not found" until wp_insert_term() (also stubbed
    // here) runs, then a term with $termId: the two must move together, since upsertMenu() looks
    // the slug up again after creating it. Returns a bucket the caller can inspect afterwards.
    private function installFreshMenuCreation(int $termId): \stdClass
    {
        $capture               = new \stdClass();
        $capture->created      = false;
        $capture->insertedArgs = [];
        $capture->insertedName = '';

        Functions\when('wp_get_nav_menu_object')->alias(
            fn(): WP_Term|false => $capture->created ? $this->fakeTerm($termId, $capture->insertedArgs['slug'], $capture->insertedName) : false,
        );

        Functions\when('wp_insert_term')->alias(function (string $name, string $taxonomy, array $args) use ($capture, $termId): array {
            $capture->created      = true;
            $capture->insertedArgs = $args;
            $capture->insertedName = $name;
            return ['term_id' => $termId, 'term_taxonomy_id' => $termId];
        });

        return $capture;
    }
}
