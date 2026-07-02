<?php

namespace Loopress\Service;

class WPCodeService
{
    private const POST_TYPE   = 'wpcode';
    private const META_TYPE   = '_wpcode_snippet_type';
    private const META_NOTE   = '_wpcode_note';
    private const TAXONOMY    = 'wpcode-tags';

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

        if ($id === 0) {
            throw new \RuntimeException('Failed to create snippet.');
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
        $terms = wp_get_post_terms($post->ID, self::TAXONOMY, ['fields' => 'names']);

        return [
            'active' => $post->post_status === 'publish',
            'code'   => $post->post_content,
            'id'     => $post->ID,
            'note'   => get_post_meta($post->ID, self::META_NOTE, true) ?: '',
            'tags'   => is_wp_error($terms) ? [] : $terms,
            'title'  => $post->post_title,
            'type'   => get_post_meta($post->ID, self::META_TYPE, true) ?: 'php',
        ];
    }

    /** @param array<string, mixed> $data */
    private function saveMeta(int $id, array $data): void
    {
        if (isset($data['note'])) {
            update_post_meta($id, self::META_NOTE, sanitize_text_field($data['note']));
        }

        if (isset($data['type'])) {
            update_post_meta($id, self::META_TYPE, sanitize_text_field($data['type']));
        }

        if (isset($data['tags']) && is_array($data['tags'])) {
            $this->setTags($id, $data['tags']);
        }
    }

    /** @param string[] $tags */
    private function setTags(int $id, array $tags): void
    {
        $termIds = [];
        foreach ($tags as $tag) {
            $term = get_term_by('name', $tag, self::TAXONOMY);
            if (!$term instanceof \WP_Term) {
                $result    = wp_insert_term($tag, self::TAXONOMY);
                $termIds[] = is_wp_error($result) ? null : $result['term_id'];
            } else {
                $termIds[] = $term->term_id;
            }
        }

        wp_set_post_terms($id, array_filter($termIds), self::TAXONOMY);
    }
}
