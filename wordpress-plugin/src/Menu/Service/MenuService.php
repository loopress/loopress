<?php

declare(strict_types=1);

namespace Loopress\Menu\Service;

// Syncs WordPress nav menus (a `nav_menu` term plus its `nav_menu_item` posts) as a portable
// tree, and the active theme's menu locations (a `nav_menu_locations` theme_mod).
//
// The one hard problem here: `_menu_item_object_id` is a post/term ID, and IDs are never the
// same across two WordPress installs. Pushing them raw would silently point a menu link at
// whatever unrelated content happens to own that ID on the target site. So every item is
// exported and resolved by identity instead: `object` (a post type or taxonomy slug) plus
// `objectSlug` (that post's/term's own slug), the same "resolve by slug, never by raw id"
// approach Seo\Service\AbstractSeoService::findPost() already uses for post-meta. `custom` items
// (a raw URL) have no target to resolve, they round-trip untouched.
//
// A menu item's own post ID has no natural, human-meaningful identity to diff or match against
// across environments either (unlike ACF's `key` or a post's `slug`), so a menu is synced as one
// atomic unit: `upsertMenu()` resolves and validates the whole incoming tree first (no writes
// yet, so a bad item aborts before anything is touched), then replaces every existing item under
// that menu with freshly created ones, nested top-down so each child's `menu-item-parent-id` can
// reference its own newly created parent.
class MenuService
{
    private const SUPPORTED_ITEM_TYPES = ['post_type', 'taxonomy', 'custom'];

    /** @return array<int, array<string, mixed>> */
    public function listMenus(): array
    {
        return array_map(fn(\WP_Term $menu): array => $this->exportMenu($menu), wp_get_nav_menus());
    }

    /** @return array<string, mixed>|null */
    public function getMenu(string $slug): ?array
    {
        $menu = wp_get_nav_menu_object($slug);

        return $menu instanceof \WP_Term ? $this->exportMenu($menu) : null;
    }

    /**
     * Creates the menu if `$slug` doesn't exist yet (the slug is set explicitly, never derived
     * from `$name`, so the identity this method is called with is the identity it keeps), or
     * updates its name and replaces its items otherwise. The slug itself is permanent, like
     * ACF's `key`: there is no rename here, only create or update-in-place.
     *
     * @param array<int, mixed> $items
     * @return array<string, mixed>
     */
    public function upsertMenu(string $slug, string $name, array $items): array
    {
        // Resolved (and every custom-URL warning collected) before any write happens: an item
        // this environment can't resolve must abort the whole push, not leave the menu half
        // rebuilt with some of its old items already deleted.
        $warnings = [];
        $resolved = $this->resolveItems($items, $warnings);

        $menu = wp_get_nav_menu_object($slug);
        if (!$menu instanceof \WP_Term) {
            $menuId = wp_insert_term($name, 'nav_menu', ['slug' => $slug]);
            if (is_wp_error($menuId)) {
                throw new \RuntimeException(esc_html("Could not create menu \"{$slug}\": " . $menuId->get_error_message()));
            }

            $menuId = (int) $menuId['term_id'];
        } else {
            $menuId = (int) $menu->term_id;
            if ($menu->name !== $name) {
                $updated = wp_update_term($menuId, 'nav_menu', ['name' => $name]);
                if (is_wp_error($updated)) {
                    throw new \RuntimeException(esc_html("Could not rename menu \"{$slug}\": " . $updated->get_error_message()));
                }
            }
        }

        $this->replaceItems($menuId, $resolved);

        $export = $this->getMenu($slug);
        if ($export === null) {
            throw new \RuntimeException(esc_html("Failed to read back menu \"{$slug}\" after writing it."));
        }

        if ($warnings !== []) {
            $existingWarnings = is_array($export['warnings']) ? $export['warnings'] : [];
            $export['warnings'] = [...$warnings, ...$existingWarnings];
        }

        return $export;
    }

    public function deleteMenu(string $slug): bool
    {
        $menu = wp_get_nav_menu_object($slug);
        if (!$menu instanceof \WP_Term) {
            return false;
        }

        return true === wp_delete_nav_menu($menu->term_id);
    }

    // ── Locations (a theme_mod: scoped to whichever theme is active when this runs, the same
    // scoping WordPress itself applies to every get_theme_mod()/set_theme_mod() call) ────────

    /** @return array<string, null|string> location => menu slug, every registered location included */
    public function getLocations(): array
    {
        $registered = get_registered_nav_menus();
        $assigned   = get_nav_menu_locations();

        $result = [];
        foreach (array_keys($registered) as $location) {
            $menuId = $assigned[$location] ?? null;
            $result[$location] = $menuId ? $this->slugForMenuId((int) $menuId) : null;
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $mapping location => menu slug, or null to unassign it
     * @return array<string, null|string>
     */
    public function setLocations(array $mapping): array
    {
        $registered = get_registered_nav_menus();
        $current    = get_nav_menu_locations();

        foreach ($mapping as $location => $slug) {
            if (!array_key_exists($location, $registered)) {
                throw new \RuntimeException(esc_html(
                    "\"{$location}\" is not a registered nav menu location for the active theme.",
                ));
            }

            if ($slug === null) {
                unset($current[$location]);
                continue;
            }

            if (!is_string($slug) || $slug === '') {
                throw new \RuntimeException(esc_html("Location \"{$location}\" must map to a menu slug string or null."));
            }

            $menu = wp_get_nav_menu_object($slug);
            if (!$menu instanceof \WP_Term) {
                throw new \RuntimeException(esc_html(
                    "No menu with slug \"{$slug}\" was found. Push the menu itself before assigning it to a location.",
                ));
            }

            $current[$location] = $menu->term_id;
        }

        set_theme_mod('nav_menu_locations', $current);

        return $this->getLocations();
    }

    private function slugForMenuId(int $menuId): ?string
    {
        $menu = wp_get_nav_menu_object($menuId);

        // A location can point at a menu that was since deleted; reported the same as "unset"
        // rather than guessing, there is nothing stable left to report.
        return $menu instanceof \WP_Term ? $menu->slug : null;
    }

    // ── Export (read) ──────────────────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    private function exportMenu(\WP_Term $menu): array
    {
        $warnings = [];
        $items    = wp_get_nav_menu_items($menu->term_id) ?? [];

        $byParent = [];
        foreach ($items as $item) {
            $exported = $this->exportItem($item, $warnings);
            if ($exported === null) {
                continue; // a dangling item (its target no longer exists), warned about, not exported
            }

            $parentId = (int) get_post_meta($item->ID, '_menu_item_menu_item_parent', true);
            $byParent[$parentId][(int) $item->menu_order] = $exported;
        }

        return [
            'items'    => $this->buildTree(0, $byParent),
            'name'     => $menu->name,
            'slug'     => $menu->slug,
            'warnings' => $warnings,
        ];
    }

    /**
     * @param array<int, array<int, array<string, mixed>>> $byParent parent item post ID =>
     *        (menu_order => exported node, its own `children` not yet filled in)
     * @return array<int, array<string, mixed>>
     */
    private function buildTree(int $parentId, array $byParent): array
    {
        if (!isset($byParent[$parentId])) {
            return [];
        }

        ksort($byParent[$parentId]);

        $nodes = [];
        foreach ($byParent[$parentId] as $node) {
            $node['children'] = $this->buildTree($node['_id'], $byParent);
            unset($node['_id']);
            $nodes[] = $node;
        }

        return $nodes;
    }

    /**
     * @param array<int, string> $warnings
     * @return array<string, mixed>|null
     */
    private function exportItem(\WP_Post $item, array &$warnings): ?array
    {
        $type = (string) get_post_meta($item->ID, '_menu_item_type', true);

        $node = [
            '_id'         => $item->ID,
            'children'    => [],
            'classes'     => $this->exportClasses($item->ID),
            'description' => (string) $item->post_excerpt,
            'object'      => null,
            'objectSlug'  => null,
            'target'      => (string) get_post_meta($item->ID, '_menu_item_target', true),
            'title'       => (string) $item->post_title,
            'type'        => $type,
            'url'         => null,
            'xfn'         => (string) get_post_meta($item->ID, '_menu_item_xfn', true),
        ];

        if ($type === 'custom') {
            $node['url'] = (string) get_post_meta($item->ID, '_menu_item_url', true);
            return $node;
        }

        // Every SUPPORTED_ITEM_TYPES entry except 'custom' (already handled and returned above).
        if (!in_array($type, ['post_type', 'taxonomy'], true)) {
            // A type Loopress doesn't resolve by identity (e.g. `post_type_archive`, or one a
            // third-party plugin adds): exported as a warning, not guessed at or silently
            // dropped, and never round-tripped through push (see resolveItems()).
            $warnings[] = "Menu item {$item->ID} has an unsupported type \"{$type}\" and was skipped. Only post_type, taxonomy, and custom items are synced.";
            return null;
        }

        $object   = (string) get_post_meta($item->ID, '_menu_item_object', true);
        $objectId = (int) get_post_meta($item->ID, '_menu_item_object_id', true);

        $slug = $type === 'post_type' ? $this->postSlug($objectId, $object) : $this->termSlug($objectId, $object);
        if ($slug === null) {
            $warnings[] = "Menu item {$item->ID} ({$type}/{$object}) references object id {$objectId}, which no longer exists, and was skipped.";
            return null;
        }

        $node['object']     = $object;
        $node['objectSlug'] = $slug;

        return $node;
    }

    private function postSlug(int $postId, string $postType): ?string
    {
        $post = get_post($postId);

        return $post instanceof \WP_Post && $post->post_type === $postType && $post->post_status !== 'trash' ? $post->post_name : null;
    }

    private function termSlug(int $termId, string $taxonomy): ?string
    {
        $term = get_term($termId, $taxonomy);

        return $term instanceof \WP_Term ? $term->slug : null;
    }

    /** @return array<int, string> */
    private function exportClasses(int $itemId): array
    {
        $raw = get_post_meta($itemId, '_menu_item_classes', true);
        // WordPress itself stores this meta as a single-element array holding one space-joined
        // string (confirmed against wp-admin's own nav-menu save handler), not one element per
        // class; split back out here so the JSON holds a readable list instead of that quirk.
        $joined = is_array($raw) ? (string) ($raw[0] ?? '') : '';

        return array_values(array_filter(explode(' ', $joined), fn(string $className): bool => $className !== ''));
    }

    // ── Resolve + apply (write) ────────────────────────────────────────────────────────────

    /**
     * Validates and resolves a whole item tree with no side effects: every post_type/taxonomy
     * item's `object`/`objectSlug` must resolve to real, existing content on this environment,
     * and every item's `type` must be one Loopress round-trips (see SUPPORTED_ITEM_TYPES).
     * Throws immediately on the first problem, so replaceItems() never runs against a
     * partially-invalid tree. `custom` items whose URL points off-environment aren't blocked
     * (unlike Seo\Service\RankMathService's redirect guard), only warned about: a menu can
     * legitimately link off-site, this is just a nudge to check that was intentional before
     * syncing the same menu to another environment.
     *
     * `$items` is only documented as `array<int, mixed>`, not a nested array shape: it comes
     * straight from JSON-decoded request input, so a non-array element is a real possibility
     * the is_array() check below actually has to handle, not dead code.
     *
     * @param array<int, mixed> $items
     * @param array<int, string> $warnings
     * @return array<int, array{args: array<string, mixed>, children: array<int, mixed>}>
     */
    private function resolveItems(array $items, array &$warnings): array
    {
        $resolved = [];
        foreach ($items as $position => $item) {
            if (!is_array($item)) {
                throw new \RuntimeException(esc_html('Every menu item must be an object.'));
            }

            $type = (string) ($item['type'] ?? '');
            if (!in_array($type, self::SUPPORTED_ITEM_TYPES, true)) {
                throw new \RuntimeException(esc_html(
                    "Menu item type \"{$type}\" is not supported. Use one of: " . implode(', ', self::SUPPORTED_ITEM_TYPES) . '.',
                ));
            }

            $args = [
                'menu-item-classes'     => implode(' ', array_map('strval', (array) ($item['classes'] ?? []))),
                'menu-item-description' => (string) ($item['description'] ?? ''),
                'menu-item-position'    => $position + 1,
                'menu-item-status'      => 'publish',
                'menu-item-target'      => (string) ($item['target'] ?? ''),
                'menu-item-title'       => (string) ($item['title'] ?? ''),
                'menu-item-type'        => $type,
                'menu-item-xfn'         => (string) ($item['xfn'] ?? ''),
            ];

            if ($type === 'custom') {
                $url = (string) ($item['url'] ?? '');
                if ($url === '') {
                    throw new \RuntimeException(esc_html('A "custom" menu item must include a non-empty "url".'));
                }

                foreach ($this->customUrlWarnings($url) as $warning) {
                    $warnings[] = $warning;
                }

                $args['menu-item-object']    = '';
                $args['menu-item-object-id'] = 0;
                $args['menu-item-url']       = $url;
            } else {
                $object     = (string) ($item['object'] ?? '');
                $objectSlug = (string) ($item['objectSlug'] ?? '');
                if ($object === '' || $objectSlug === '') {
                    throw new \RuntimeException(esc_html(
                        "A \"{$type}\" menu item must include a non-empty \"object\" and \"objectSlug\".",
                    ));
                }

                $args['menu-item-object']    = $object;
                $args['menu-item-object-id'] = $this->resolveObjectId($type, $object, $objectSlug);
                $args['menu-item-url']       = '';
            }

            $children = is_array($item['children'] ?? null) ? $this->resolveItems($item['children'], $warnings) : [];
            $resolved[] = ['args' => $args, 'children' => $children];
        }

        return $resolved;
    }

    // The identity resolution this whole service exists for: never trust a raw
    // `_menu_item_object_id` from another environment, always re-look-up the target by its
    // stable slug on THIS environment (mirrors AbstractSeoService::findPost()'s
    // get_page_by_path() use for the same reason).
    private function resolveObjectId(string $type, string $objectType, string $objectSlug): int
    {
        if ($type === 'taxonomy') {
            $term = get_term_by('slug', $objectSlug, $objectType);
            if (!$term instanceof \WP_Term) {
                throw new \RuntimeException(esc_html(
                    "No \"{$objectType}\" term with slug \"{$objectSlug}\" was found on this environment. Menu items are resolved by " .
                    'identity, they cannot reference content that does not exist here.',
                ));
            }

            return (int) $term->term_id;
        }

        $post = get_page_by_path($objectSlug, OBJECT, $objectType);
        if (!$post instanceof \WP_Post) {
            throw new \RuntimeException(esc_html(
                "No \"{$objectType}\" post with slug \"{$objectSlug}\" was found on this environment. Menu items are resolved by " .
                'identity, they cannot reference content that does not exist here.',
            ));
        }

        return (int) $post->ID;
    }

    /** @return array<int, string> */
    private function customUrlWarnings(string $url): array
    {
        $target = wp_parse_url($url);
        $host   = $target['host'] ?? null;
        if ($host === null) {
            return []; // a relative path is always on this site
        }

        $currentHost = wp_parse_url(home_url())['host'] ?? null;
        if ($currentHost !== null && strcasecmp((string) $host, $currentHost) === 0) {
            return [];
        }

        return [
            "Custom menu item URL \"{$url}\" points to a different domain (\"{$host}\") than this environment " .
            "(\"{$currentHost}\"). Check that this is intentional before syncing it to another environment.",
        ];
    }

    /**
     * Creates `$resolved` top-down first, and only deletes the existing items of `$menuId` once
     * every new one has been created successfully: `resolveItems()` already rules out a bad
     * *input* tree before this runs, but wp_update_nav_menu_item() can still fail mid-way for
     * reasons outside that (a DB error, a race). Deleting-then-creating would leave the menu with
     * only whichever new items got created before the failure, permanently losing the rest of its
     * original content. Creating first means a failure here still leaves the original items
     * intact; createItems() below rolls back the partial replacement it already made before
     * this rethrows, so the menu is left exactly as it was, not half-migrated.
     *
     * @param array<int, array{args: array<string, mixed>, children: array<int, mixed>}> $resolved
     */
    private function replaceItems(int $menuId, array $resolved): void
    {
        $existing = wp_get_nav_menu_items($menuId) ?? [];

        $createdIds = [];
        try {
            $this->createItems($menuId, 0, $resolved, $createdIds);
        } catch (\Throwable $error) {
            foreach ($createdIds as $createdId) {
                wp_delete_post($createdId, true);
            }

            throw $error;
        }

        foreach ($existing as $item) {
            wp_delete_post($item->ID, true);
        }
    }

    /**
     * A parent is always created before its children so each child's `menu-item-parent-id` can
     * reference the parent's freshly assigned post ID.
     *
     * @param array<int, array{args: array<string, mixed>, children: array<int, mixed>}> $resolved
     * @param array<int, int> $createdIds every item id created so far, appended to as this
     *        recurses, so replaceItems() can roll all of them back on a later failure
     */
    private function createItems(int $menuId, int $parentId, array $resolved, array &$createdIds): void
    {
        foreach ($resolved as $item) {
            $itemId = wp_update_nav_menu_item($menuId, 0, [...$item['args'], 'menu-item-parent-id' => $parentId]);
            if (is_wp_error($itemId)) {
                throw new \RuntimeException(esc_html('Failed to create menu item: ' . $itemId->get_error_message()));
            }

            $createdIds[] = (int) $itemId;
            $this->createItems($menuId, (int) $itemId, $item['children'], $createdIds);
        }
    }
}
