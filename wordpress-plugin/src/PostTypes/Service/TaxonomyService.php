<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Service;

// Taxonomies declared in `taxonomies/<slug>.json` (`lps taxonomy push`), see
// AbstractDeclaredTypeService. A file is the register_taxonomy() arguments plus one key that isn't
// one, `object_type`: the function's second parameter, the post types the taxonomy attaches to.
// Only the taxonomy itself is synced, never its terms (content, like posts).
class TaxonomyService extends AbstractDeclaredTypeService
{
    public const OPTION = 'loopress_taxonomies';

    /**
     * Every taxonomy a site owner would recognise (Loopress's, public ones, and any with its own
     * admin screen), with where it comes from and the post types it's attached to, for the
     * read-only admin viewer and `lps taxonomy list`.
     *
     * @return list<array{slug: string, label: string, source: string, count: int, objectTypes: list<string>, managed: bool, conflict: bool}>
     */
    public function registered(): array
    {
        $stored = $this->stored();
        $acf    = $this->acfSlugs();
        $cptui  = get_option('cptui_taxonomies');
        $cptui  = is_array($cptui) ? $cptui : [];

        $result = [];
        foreach (get_taxonomies([], 'objects') as $slug => $object) {
            $ours    = $this->isOurs($slug, $object);
            $visible = $object->public || ($object->show_ui && !$object->_builtin);
            if (!$ours && !$visible && !isset($stored[$slug])) {
                continue;
            }

            $source = match (true) {
                $ours => 'loopress',
                $object->_builtin => 'wordpress', // phpcs:ignore WordPress.WP.CapitalPDangit -- a source id, not prose.
                isset($acf[$slug]) => 'acf',
                isset($cptui[$slug]) => 'cptui',
                default => 'other',
            };

            $count    = wp_count_terms(['taxonomy' => $slug, 'hide_empty' => false]);
            $result[] = [
                'slug'        => $slug,
                'label'       => (string) $object->label,
                'source'      => $source,
                'count'       => is_wp_error($count) ? 0 : (int) $count,
                'objectTypes' => array_values(array_map('strval', (array) $object->object_type)),
                'managed'     => isset($stored[$slug]),
                'conflict'    => isset($stored[$slug]) && !$ours,
            ];
        }

        return $result;
    }

    protected function option(): string
    {
        return self::OPTION;
    }

    protected function noun(): string
    {
        return 'Taxonomy';
    }

    protected function directory(): string
    {
        return 'taxonomies';
    }

    protected function maxSlugLength(): int
    {
        return 32;
    }

    // WordPress's own taxonomies and the public query vars a taxonomy key must not shadow.
    protected function reservedSlugs(): array
    {
        return [
            'category', 'post_tag', 'nav_menu', 'link_category', 'post_format',
            'attachment', 'author', 'cat', 'day', 'feed', 'hour', 'm', 'minute', 'monthnum', 'name', 'order',
            'orderby', 'p', 'page', 'paged', 'post', 'post_type', 's', 'search', 'second', 'status', 'tag',
            'taxonomy', 'term', 'theme', 'type', 'w', 'year',
        ];
    }

    // The callbacks are called, rest_controller_class is instantiated as a class.
    protected function codeArgs(): array
    {
        return ['meta_box_cb', 'meta_box_sanitize_cb', 'update_count_callback', 'rest_controller_class'];
    }

    protected function arrayArgs(): array
    {
        return ['object_type' => [], 'labels' => [], 'capabilities' => [], 'rewrite' => [true, false]];
    }

    protected function exists(string $slug): bool
    {
        return taxonomy_exists($slug);
    }

    /**
     * @param non-empty-lowercase-string $slug
     * @param array<string, mixed> $args
     */
    protected function registerOne(string $slug, array $args): mixed
    {
        /** @var array<array-key, string> $objectType checked to be an array by assertValid() */
        $objectType = $args['object_type'] ?? [];
        unset($args['object_type']);

        return register_taxonomy($slug, $objectType, $args);
    }

    /** @return array<string, true> Slugs of the taxonomies ACF (6.1+) registers from its own UI. */
    private function acfSlugs(): array
    {
        if (!function_exists('acf_get_acf_taxonomies')) {
            return [];
        }

        $slugs = [];
        foreach (acf_get_acf_taxonomies() as $taxonomy) {
            if (is_array($taxonomy) && is_string($taxonomy['taxonomy'] ?? null)) {
                $slugs[$taxonomy['taxonomy']] = true;
            }
        }

        return $slugs;
    }
}
