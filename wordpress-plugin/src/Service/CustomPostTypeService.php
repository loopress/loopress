<?php

namespace Loopress\Service;

class CustomPostTypeService
{
    /** @param array<string, mixed> $args @return array<int, array<string, mixed>> */
    public function getPosts(string $postType, array $args = []): array
    {
        $query = new \WP_Query(array_merge([
            'post_type'      => $postType,
            'posts_per_page' => -1,
            'post_status'    => 'any',
        ], $args));

        return array_map([$this, 'formatPost'], $query->posts);
    }

    public function getPost(string $postType, int $id): ?array
    {
        $post = get_post($id);

        if (!$post || $post->post_type !== $postType) {
            return null;
        }

        return $this->formatPost($post);
    }

    private function formatPost(\WP_Post $post): array
    {
        return [
            'id'         => $post->ID,
            'title'      => $post->post_title,
            'content'    => $post->post_content,
            'status'     => $post->post_status,
            'created_at' => $post->post_date,
            'updated_at' => $post->post_modified,
            'meta'       => get_post_meta($post->ID),
        ];
    }
}
