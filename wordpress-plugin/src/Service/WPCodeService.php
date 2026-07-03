<?php

namespace Loopress\Service;

class WPCodeService
{
    private const POST_TYPE         = 'wpcode';
    private const META_NOTE         = '_wpcode_note';
    private const META_AUTO_INSERT  = '_wpcode_auto_insert';
    private const META_PRIORITY     = '_wpcode_priority';
    private const META_SHORTCODE_ATTRIBUTES = '_wpcode_shortcode_attributes';
    private const TYPE_TAXONOMY     = 'wpcode_type';
    private const LOCATION_TAXONOMY = 'wpcode_location';
    private const TAXONOMY          = 'wpcode_tags';

    public function isWPCodeActive(): bool
    {
        return post_type_exists(self::POST_TYPE);
    }

    /** @return array<int, array<string, mixed>> */
    public function getSnippets(): array
    {
        $posts = get_posts([
            'post_type'      => self::POST_TYPE,
            'posts_per_page' => -1,
            'post_status'    => ['publish', 'draft'],
        ]);

        return array_map([$this, 'normalize'], $posts);
    }

    /** @return array<string, mixed>|null */
    public function getSnippet(int $id): ?array
    {
        $post = get_post($id);
        if (!$post instanceof \WP_Post || $post->post_type !== self::POST_TYPE) {
            return null;
        }

        return $this->normalize($post);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function createSnippet(array $data): array
    {
        $id = wp_insert_post([
            'post_type'    => self::POST_TYPE,
            'post_title'   => sanitize_text_field($data['title'] ?? ''),
            'post_content' => wp_unslash($data['code'] ?? ''),
            'post_status'  => !empty($data['active']) ? 'publish' : 'draft',
        ], true);

        if (is_wp_error($id)) {
            throw new \RuntimeException('Failed to create snippet: ' . $id->get_error_message());
        }

        $this->saveMeta($id, $data);

        return $this->getSnippet($id) ?? [];
    }

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function updateSnippet(int $id, array $data): ?array
    {
        $post = get_post($id);
        if (!$post instanceof \WP_Post || $post->post_type !== self::POST_TYPE) {
            return null;
        }

        $update = ['ID' => $id];

        if (isset($data['title'])) {
            $update['post_title'] = sanitize_text_field($data['title']);
        }
        if (isset($data['code'])) {
            $update['post_content'] = wp_unslash($data['code']);
        }
        if (isset($data['active'])) {
            $update['post_status'] = $data['active'] ? 'publish' : 'draft';
        }

        $result = wp_update_post($update, true);
        if (is_wp_error($result)) {
            throw new \RuntimeException('Failed to update snippet: ' . $result->get_error_message());
        }

        $this->saveMeta($id, $data);

        return $this->getSnippet($id);
    }

    /** @return array<string, mixed> */
    private function normalize(\WP_Post $post): array
    {
        $terms               = wp_get_post_terms($post->ID, self::TAXONOMY, ['fields' => 'names']);
        $typeTerm            = $this->getSingleTerm($post->ID, self::TYPE_TAXONOMY);
        $locationTerm        = $this->getSingleTerm($post->ID, self::LOCATION_TAXONOMY);
        $autoInsert          = get_post_meta($post->ID, self::META_AUTO_INSERT, true);
        $priority            = get_post_meta($post->ID, self::META_PRIORITY, true);
        $shortcodeAttributes = get_post_meta($post->ID, self::META_SHORTCODE_ATTRIBUTES, true);
        $note                = get_post_meta($post->ID, self::META_NOTE, true);

        return [
            'active'               => $post->post_status === 'publish',
            'code'                 => $post->post_content,
            'id'                   => $post->ID,
            'insert_method'        => '0' === $autoInsert ? 'shortcode' : 'auto',
            'location'             => $locationTerm,
            'note'                 => $note ? $note : '',
            'priority'             => '' === $priority ? 10 : (int) $priority,
            'shortcode_attributes' => is_array($shortcodeAttributes) ? $shortcodeAttributes : [],
            'tags'                 => is_wp_error($terms) ? [] : $terms,
            'title'                => $post->post_title,
            'type'                 => $typeTerm !== '' ? $typeTerm : 'php',
        ];
    }

    /** WPCode stores the code type and location as single terms of their own taxonomies, not as post meta. */
    private function getSingleTerm(int $id, string $taxonomy): string
    {
        $terms = wp_get_post_terms($id, $taxonomy, ['fields' => 'slugs']);

        return is_wp_error($terms) || empty($terms) ? '' : (string) $terms[0];
    }

    /** @param array<string, mixed> $data */
    private function saveMeta(int $id, array $data): void
    {
        if (isset($data['note'])) {
            update_post_meta($id, self::META_NOTE, sanitize_text_field($data['note']));
        }

        if (isset($data['type'])) {
            wp_set_post_terms($id, [sanitize_text_field($data['type'])], self::TYPE_TAXONOMY);
        }

        if (isset($data['tags']) && is_array($data['tags'])) {
            $this->setTags($id, $data['tags']);
        }

        if (isset($data['insert_method'])) {
            update_post_meta($id, self::META_AUTO_INSERT, 'shortcode' === $data['insert_method'] ? 0 : 1);
        }

        if (isset($data['location'])) {
            wp_set_post_terms($id, [sanitize_text_field($data['location'])], self::LOCATION_TAXONOMY);
        }

        if (isset($data['priority'])) {
            update_post_meta($id, self::META_PRIORITY, (int) $data['priority']);
        }

        if (isset($data['shortcode_attributes']) && is_array($data['shortcode_attributes'])) {
            update_post_meta($id, self::META_SHORTCODE_ATTRIBUTES, array_map('sanitize_key', $data['shortcode_attributes']));
        }
    }

    /**
     * @param string[] $tags
     *
     * wp_set_post_terms() already creates any term passed by name that doesn't exist
     * yet in the taxonomy, so there's no need to look up/insert terms by hand first.
     */
    private function setTags(int $id, array $tags): void
    {
        wp_set_post_terms($id, $tags, self::TAXONOMY);
    }
}
