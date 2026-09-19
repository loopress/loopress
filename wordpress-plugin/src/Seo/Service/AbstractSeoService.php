<?php

declare(strict_types=1);

namespace Loopress\Seo\Service;

use Loopress\RestApi\SyncSanitizer;
use Loopress\Seo\Contract\SeoProvider;
use Loopress\Seo\Exception\StaleSeoRevisionException;

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
     * @param string|null $expectedRevision When given, the write is refused (#234) unless it
     *        still matches this post's current SEO-meta revision, i.e. nothing else changed it
     *        since the caller last read it via getPostMeta()/listPostMeta(). See
     *        assertPostMetaRevisionMatches().
     * @return array<string, mixed>
     */
    public function upsertPostMeta(string $postType, string $slug, array $meta, ?string $expectedRevision = null): array
    {
        $post = $this->findPost($postType, $slug);
        if ($post === null) {
            throw new \RuntimeException(esc_html(
                "No published \"{$postType}\" post with slug \"{$slug}\" was found. {$this->providerLabel()} data syncs onto existing content, it does not create posts."
            ));
        }

        if ($expectedRevision !== null) {
            $this->assertPostMetaRevisionMatches($post, $expectedRevision);
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
            // These values render into the public <head> (title, description, OG/Twitter tags,
            // per-post JSON-LD) and the admin SEO metabox: strip active content so a pushed
            // `<script>`/`onerror=` in a title or schema field can't execute there (F12).
            update_post_meta($post->ID, $key, SyncSanitizer::deep($meta[$key]));
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
        $meta = $this->prefixedMeta($post->ID);

        return [
            'meta'     => $meta,
            // A content hash of every provider-prefixed meta key currently on the post (#234):
            // upsertPostMeta() replaces this whole set on a write (see its existing/incoming key
            // diff above), so the revision must cover it as a whole, not just the incoming keys a
            // particular write happens to mention, the same reasoning OptionsService::revisionOf()
            // documents for including autoload alongside value.
            'revision' => $this->revisionOf($meta),
            'slug'     => $post->post_name,
            'title'    => $post->post_title,
        ];
    }

    // Opaque content hash, only ever compared for equality (see assertPostMetaRevisionMatches()/
    // assertSettingsRevisionMatches()), mirrors OptionsService::revisionOf().
    /** @param array<string, mixed> $data */
    private function revisionOf(array $data): string
    {
        return hash('sha256', (string) wp_json_encode($data));
    }

    private function assertPostMetaRevisionMatches(\WP_Post $post, string $expectedRevision): void
    {
        $current = $this->revisionOf($this->prefixedMeta($post->ID));

        if ($current !== $expectedRevision) {
            throw new StaleSeoRevisionException(esc_html(
                "SEO meta for \"{$post->post_name}\" changed on WordPress since it was last read " .
                    "(expected revision \"{$expectedRevision}\", but its revision is now \"{$current}\"). " .
                    'Re-read the post and try again.',
            ));
        }
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

    /** @return array{revision: string, settings: array<string, mixed>} */
    public function getSettings(): array
    {
        $settings = $this->rawSettings();

        // Wrapped (unlike a plain settings array) so a revision can travel alongside the
        // settings without being mistaken for one of them: settings round-trip verbatim through
        // update_option() (see updateSettings() below), so a bare 'revision' key sitting inside
        // the array itself would get persisted into wp_options as if it were a real Titles &
        // Meta field.
        return ['revision' => $this->revisionOf($settings), 'settings' => $settings];
    }

    /**
     * @param array<string, mixed> $data
     * @param string|null $expectedRevision When given, the write is refused (#234) unless it
     *        still matches the settings' current revision, i.e. nothing else changed them since
     *        the caller last read them via getSettings(). See assertSettingsRevisionMatches().
     * @return array{revision: string, settings: array<string, mixed>}
     */
    public function updateSettings(array $data, ?string $expectedRevision = null): array
    {
        if ($expectedRevision !== null) {
            $this->assertSettingsRevisionMatches($expectedRevision);
        }

        // The generic `<prefix>_*` sync deliberately has no key allowlist (it would need to
        // track every RankMath/Yoast release); instead every string value is stripped of
        // active content before it is stored, since title/meta/schema templates from this
        // option are rendered into the public <head> site-wide (F12). Unknown keys are left
        // as-is: RankMath/Yoast ignore keys they don't know, they are not a render sink.
        update_option($this->optionTitles(), SyncSanitizer::deepArray($data));

        return $this->getSettings();
    }

    private function assertSettingsRevisionMatches(string $expectedRevision): void
    {
        $current = $this->revisionOf($this->rawSettings());

        if ($current !== $expectedRevision) {
            throw new StaleSeoRevisionException(esc_html(
                'SEO settings changed on WordPress since they were last read ' .
                    "(expected revision \"{$expectedRevision}\", but its revision is now \"{$current}\"). " .
                    'Re-read the settings and try again.',
            ));
        }
    }

    /** @return array<string, mixed> */
    private function rawSettings(): array
    {
        $settings = get_option($this->optionTitles(), []);

        return is_array($settings) ? $settings : [];
    }
}
