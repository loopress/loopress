<?php

declare(strict_types=1);

namespace Loopress\Seo\Service;

use Loopress\Seo\Contract\SeoRedirectProvider;

// One of two interchangeable SeoProvider backends (see SeoService for the arbitration between
// this and YoastService), the same shape as CodeSnippetsSnippetProvider/WPCodeSnippetProvider.
// RankMath is also the only one of the two implementing SeoRedirectProvider: Yoast's equivalent
// is Premium-only.
//
// Post-level SEO data (title, description, robots, canonical, social, and per-post schema
// blocks) is all stored as postmeta prefixed `rank_math_`. Rather than hardcoding the list of
// known keys (long, and grows whenever RankMath ships a new field or schema type), this class
// syncs every `rank_math_*` postmeta key generically: whatever RankMath itself writes is what
// gets read and written back, with no allowlist to keep in sync with RankMath's own releases.
class RankMathService implements SeoRedirectProvider
{
    private const META_PREFIX = 'rank_math_';
    private const OPTION_TITLES = 'rank-math-options-titles';

    public function isActive(): bool
    {
        return defined('RANK_MATH_VERSION');
    }

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
     * The post must already exist: RankMath data has no meaning without a host post, and
     * unlike ACF field groups or redirects this integration never creates content on its own.
     *
     * @param array<string, mixed> $meta
     * @return array<string, mixed>
     */
    public function upsertPostMeta(string $postType, string $slug, array $meta): array
    {
        $post = $this->findPost($postType, $slug);
        if ($post === null) {
            throw new \RuntimeException(esc_html(
                "No published \"{$postType}\" post with slug \"{$slug}\" was found. RankMath data syncs onto existing content, it does not create posts."
            ));
        }

        $existingKeys = array_keys($this->rankMathMeta($post->ID));
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
            'meta'  => $this->rankMathMeta($post->ID),
            'slug'  => $post->post_name,
            'title' => $post->post_title,
        ];
    }

    /** @return array<string, mixed> */
    private function rankMathMeta(int $postId): array
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

    // ── Site-wide Titles & Meta settings (includes per-post-type schema defaults) ─────────

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

    // ── Redirects ───────────────────────────────────────────────────────────────────────

    /** @return array<int, array<string, mixed>> */
    public function listRedirections(): array
    {
        global $wpdb;
        $this->requireRedirectionsModuleEnabled();

        $rows = $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM %i WHERE status != 'trashed' ORDER BY id ASC", $this->redirectionsTable()),
            ARRAY_A
        );

        return array_map([$this, 'exportRedirection'], $rows ?? []);
    }

    /** @return array<string, mixed>|null */
    public function getRedirection(int $id): ?array
    {
        global $wpdb;
        $this->requireRedirectionsModuleEnabled();

        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT * FROM %i WHERE id = %d', $this->redirectionsTable(), $id),
            ARRAY_A
        );

        return $row === null ? null : $this->exportRedirection($row);
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function createRedirection(array $data): array
    {
        global $wpdb;
        $this->requireRedirectionsModuleEnabled();

        $now = current_time('mysql');
        $wpdb->insert($this->redirectionsTable(), [
            'created'     => $now,
            'header_code' => (int) ($data['headerCode'] ?? 301),
            'hits'        => 0,
            'sources'     => maybe_serialize($data['sources'] ?? []),
            'status'      => (string) ($data['status'] ?? 'active'),
            'updated'     => $now,
            'url_to'      => (string) ($data['urlTo'] ?? ''),
        ]);

        return $this->getRedirection((int) $wpdb->insert_id) ?? [];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>|null
     */
    public function updateRedirection(int $id, array $data): ?array
    {
        global $wpdb;
        $this->requireRedirectionsModuleEnabled();

        if ($this->getRedirection($id) === null) {
            return null;
        }

        $update = ['updated' => current_time('mysql')];
        if (isset($data['sources'])) {
            $update['sources'] = maybe_serialize($data['sources']);
        }
        if (isset($data['urlTo'])) {
            $update['url_to'] = (string) $data['urlTo'];
        }
        if (isset($data['headerCode'])) {
            $update['header_code'] = (int) $data['headerCode'];
        }
        if (isset($data['status'])) {
            $update['status'] = (string) $data['status'];
        }

        $wpdb->update($this->redirectionsTable(), $update, ['id' => $id]);

        return $this->getRedirection($id);
    }

    // Table/column names (`{$wpdb->prefix}rank_math_redirections`; id, sources, url_to,
    // header_code, status, hits, created, updated) confirmed against RankMath's own
    // includes/class-installer.php on a real install (e2e/rankmath-sync.spec.ts exercises this
    // against that same real install).
    private function redirectionsTable(): string
    {
        global $wpdb;

        return $wpdb->prefix . 'rank_math_redirections';
    }

    // Unlike the plugin-wide isActive() gate (checked at the REST controller, same as every
    // other resource here), Redirections is one of several optional modules RankMath ships
    // disabled by default (Dashboard > Modules): its table is only created once an admin turns
    // it on. Discovered by hand against a real install, where the table was genuinely absent;
    // without this guard, the queries above would silently return an empty list or fail with an
    // opaque "table doesn't exist" error instead of pointing at the actual cause.
    private function requireRedirectionsModuleEnabled(): void
    {
        $modules = get_option('rank_math_modules', []);
        if (!is_array($modules) || !in_array('redirections', $modules, true)) {
            throw new \RuntimeException('The RankMath Redirections module is not enabled. Enable it under RankMath > Dashboard > Modules.');
        }
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function exportRedirection(array $row): array
    {
        return [
            'createdAt'  => $row['created'] ?? null,
            'headerCode' => (int) ($row['header_code'] ?? 301),
            'hits'       => (int) ($row['hits'] ?? 0),
            'id'         => (int) $row['id'],
            'sources'    => maybe_unserialize($row['sources'] ?? ''),
            'status'     => (string) ($row['status'] ?? 'active'),
            'updatedAt'  => $row['updated'] ?? null,
            'urlTo'      => (string) ($row['url_to'] ?? ''),
        ];
    }
}
