<?php

namespace Loopress\Service;

// Yoast SEO has exactly one backend (itself, or nothing), same shape as AcfService: no provider
// interface needed here, this talks to Yoast's own storage directly.
//
// Post-level SEO data (title, description, robots, canonical, social, and schema type
// selection) is all stored as postmeta prefixed `_yoast_wpseo_` (the leading underscore marks
// it "protected" in WordPress's own sense, hidden from the default custom fields UI, but it
// reads/writes through get_post_meta()/update_post_meta() exactly like any other meta). Rather
// than hardcoding the list of known keys, this class syncs every `_yoast_wpseo_*` postmeta key
// generically, whatever Yoast itself writes is what gets read and written back.
//
// Yoast's redirect manager is a Premium-only feature with a storage model this codebase hasn't
// verified against a real install, it isn't covered here (see RankMathService for the
// equivalent RankMath feature, which is free and so is covered).
class YoastService
{
    private const META_PREFIX = '_yoast_wpseo_';
    private const OPTION_TITLES = 'wpseo_titles';

    public function isActive(): bool
    {
        return defined('WPSEO_VERSION');
    }

    /** @return array<int, array<string, mixed>> */
    public function listPostMeta(string $postType): array
    {
        $posts = get_posts([
            'post_status'    => 'publish',
            'post_type'      => $postType,
            'posts_per_page' => -1,
        ]);

        return array_map(fn(\WP_Post $post): array => $this->exportPost($post), $posts);
    }

    /** @return array<string, mixed>|null */
    public function getPostMeta(string $postType, string $slug): ?array
    {
        $post = $this->findPost($postType, $slug);

        return $post === null ? null : $this->exportPost($post);
    }

    /**
     * The post must already exist: Yoast data has no meaning without a host post, and this
     * integration never creates content on its own.
     *
     * @param array<string, mixed> $meta
     * @return array<string, mixed>
     */
    public function upsertPostMeta(string $postType, string $slug, array $meta): array
    {
        $post = $this->findPost($postType, $slug);
        if ($post === null) {
            throw new \RuntimeException(esc_html(
                "No published \"{$postType}\" post with slug \"{$slug}\" was found. Yoast data syncs onto existing content, it does not create posts."
            ));
        }

        $existingKeys = array_keys($this->yoastMeta($post->ID));
        $incomingKeys = array_keys($meta);

        foreach ($incomingKeys as $key) {
            update_post_meta($post->ID, $key, $meta[$key]);
        }

        foreach (array_diff($existingKeys, $incomingKeys) as $removedKey) {
            delete_post_meta($post->ID, $removedKey);
        }

        return $this->exportPost($post);
    }

    private function findPost(string $postType, string $slug): ?\WP_Post
    {
        $post = get_page_by_path($slug, OBJECT, $postType);

        return $post instanceof \WP_Post ? $post : null;
    }

    /** @return array<string, mixed> */
    private function exportPost(\WP_Post $post): array
    {
        return [
            'meta'  => $this->yoastMeta($post->ID),
            'slug'  => $post->post_name,
            'title' => $post->post_title,
        ];
    }

    /** @return array<string, mixed> */
    private function yoastMeta(int $postId): array
    {
        $meta = [];
        foreach (get_post_meta($postId) as $key => $values) {
            if (!str_starts_with($key, self::META_PREFIX)) {
                continue;
            }

            $meta[$key] = count($values) === 1 ? $values[0] : $values;
        }

        return $meta;
    }

    /** @return array<string, mixed> */
    public function getSettings(): array
    {
        $settings = get_option(self::OPTION_TITLES, []);

        return is_array($settings) ? $settings : [];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function updateSettings(array $data): array
    {
        update_option(self::OPTION_TITLES, $data);

        return $this->getSettings();
    }
}
