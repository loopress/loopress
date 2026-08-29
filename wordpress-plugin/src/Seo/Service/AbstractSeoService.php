<?php

declare(strict_types=1);

namespace Loopress\Seo\Service;

use Loopress\Seo\Contract\SeoProvider;

// Shared body of the two interchangeable SeoProvider backends (RankMathService, YoastService).
// Both store post-level SEO data as postmeta under a single fixed prefix and site-wide settings
// under a single option key, and sync every key matching that prefix generically rather than
// against a hardcoded allowlist. The only per-plugin differences are those two identifiers, the
// human label used in one error message, and the isActive() constant check, so each subclass
// supplies just those four. RankMathService additionally implements SeoRedirectProvider; Yoast's
// redirect manager is Premium-only and left uncovered.
abstract class AbstractSeoService implements SeoProvider
{
    abstract public function isActive(): bool;

    // Postmeta key prefix this plugin writes (e.g. 'rank_math_', '_yoast_wpseo_').
    abstract protected function metaPrefix(): string;

    // Option name holding the site-wide Titles & Meta settings.
    abstract protected function optionTitles(): string;

    // Plugin name as shown to the user in the "syncs onto existing content" error.
    abstract protected function providerLabel(): string;

    // ── Post meta (titles, descriptions, robots, social, per-post schema...) ──────────────

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
     * The post must already exist: this data has no meaning without a host post, and unlike ACF
     * field groups or redirects this integration never creates content on its own.
     *
     * @param array<string, mixed> $meta
     * @return array<string, mixed>
     */
    public function upsertPostMeta(string $postType, string $slug, array $meta): array
    {
        $post = $this->findPost($postType, $slug);
        if ($post === null) {
            throw new \RuntimeException(esc_html(
                "No published \"{$postType}\" post with slug \"{$slug}\" was found. {$this->providerLabel()} data syncs onto existing content, it does not create posts."
            ));
        }

        $existingKeys = array_keys($this->prefixedMeta($post->ID));
        // Bounded to this provider's own prefix, symmetrically with the deletion loop below:
        // without this, any key in the request body would be written as post meta, including
        // one belonging to another plugin (ACF, FluentCRM, etc.) on the same post.
        $incomingKeys = array_values(array_filter(
            array_keys($meta),
            fn(string $key): bool => str_starts_with($key, $this->metaPrefix())
        ));

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
            'meta'  => $this->prefixedMeta($post->ID),
            'slug'  => $post->post_name,
            'title' => $post->post_title,
        ];
    }

    /** @return array<string, mixed> */
    private function prefixedMeta(int $postId): array
    {
        $meta = [];
        foreach (get_post_meta($postId) as $key => $values) {
            if (!str_starts_with($key, $this->metaPrefix())) {
                continue;
            }

            $meta[$key] = count($values) === 1 ? $values[0] : $values;
        }

        return $meta;
    }

    // ── Site-wide Titles & Meta settings (includes per-post-type schema defaults) ─────────

    /** @return array<string, mixed> */
    public function getSettings(): array
    {
        $settings = get_option($this->optionTitles(), []);

        return is_array($settings) ? $settings : [];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function updateSettings(array $data): array
    {
        update_option($this->optionTitles(), $data);

        return $this->getSettings();
    }
}
