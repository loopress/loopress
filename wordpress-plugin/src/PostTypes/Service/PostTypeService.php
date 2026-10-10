<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Service;

// Custom post types declared in `cpt/<slug>.json` (`lps cpt push`), see AbstractDeclaredTypeService.
class PostTypeService extends AbstractDeclaredTypeService
{
    public const OPTION = 'loopress_post_types';

    /**
     * Every post type a site owner would recognise as content (Loopress's, public ones, and any
     * with its own admin menu), with where it comes from, for the read-only admin viewer and
     * `lps cpt list`.
     *
     * @return list<array{slug: string, label: string, source: string, count: int, managed: bool, conflict: bool}>
     */
    public function registered(): array
    {
        $stored = $this->stored();
        $acf    = $this->acfSlugs();
        $cptui  = get_option('cptui_post_types');
        $cptui  = is_array($cptui) ? $cptui : [];

        $result = [];
        foreach (get_post_types([], 'objects') as $slug => $object) {
            $ours    = $this->isOurs($slug, $object);
            $visible = $object->public || ($object->show_ui && $object->show_in_menu && !$object->_builtin);
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

            $counts   = wp_count_posts($slug);
            $result[] = [
                'slug'     => $slug,
                'label'    => (string) $object->label,
                'source'   => $source,
                'count'    => (int) ($counts->publish ?? 0),
                'managed'  => isset($stored[$slug]),
                'conflict' => isset($stored[$slug]) && !$ours,
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
        return 'Post type';
    }

    protected function directory(): string
    {
        return 'cpt';
    }

    protected function maxSlugLength(): int
    {
        return 20;
    }

    // WordPress's own post types and the query vars its docs say a post type must not use.
    protected function reservedSlugs(): array
    {
        return [
            'post', 'page', 'attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset',
            'oembed_cache', 'user_request', 'action', 'author', 'order', 'theme',
        ];
    }

    // register_meta_box_cb is called, the REST controller ones are instantiated as a class.
    protected function codeArgs(): array
    {
        return ['register_meta_box_cb', 'rest_controller_class', 'autosave_rest_controller_class', 'revisions_rest_controller_class'];
    }

    protected function arrayArgs(): array
    {
        return [
            'capabilities' => [], 'labels' => [], 'taxonomies' => [], 'template' => [],
            'supports' => [false], 'rewrite' => [true, false],
        ];
    }

    protected function exists(string $slug): bool
    {
        return post_type_exists($slug);
    }

    /**
     * @param non-empty-lowercase-string $slug
     * @param array<string, mixed> $args
     */
    protected function registerOne(string $slug, array $args): mixed
    {
        return register_post_type($slug, $args);
    }

    /** @return array<string, true> Slugs of the post types ACF (6.1+) registers from its own UI. */
    private function acfSlugs(): array
    {
        if (!function_exists('acf_get_acf_post_types')) {
            return [];
        }

        $slugs = [];
        foreach (acf_get_acf_post_types() as $postType) {
            if (is_array($postType) && is_string($postType['post_type'] ?? null)) {
                $slugs[$postType['post_type']] = true;
            }
        }

        return $slugs;
    }
}
