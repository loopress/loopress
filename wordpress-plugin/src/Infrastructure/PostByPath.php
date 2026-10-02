<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

/**
 * Finds a post by the identity Loopress syncs it under, on THIS environment: never a raw ID
 * from another environment. Shared by menus and SEO (and option page references), which all
 * hit the same trap: get_page_by_path() wants a child page's full path (`account/profile`), so
 * a bare `profile` misses a page that is right there.
 *
 * The full path is tried first. A bare slug (SEO files, whose identity is post_name, or menu
 * files pulled before paths were written) then falls back to a post_name match, but only when
 * exactly one post has it: post_name is unique per parent, not per site, so `account/profile`
 * and `team/profile` can both exist, and picking one would point at the wrong page.
 */
final class PostByPath
{
    /** @throws AmbiguousPostSlugException */
    public static function find(string $path, string $postType): ?\WP_Post
    {
        // get_page_by_path() also searches attachments, so a page missing here could resolve to an
        // image with the same slug: only a post of the requested type counts.
        $post = get_page_by_path($path, OBJECT, $postType);
        if ($post instanceof \WP_Post && $post->post_type === $postType) {
            return $post;
        }

        if (str_contains($path, '/')) {
            return null;
        }

        $matches = get_posts([
            'name'             => $path,
            'post_type'        => $postType,
            'post_status'      => 'any',
            'numberposts'      => -1,
            'suppress_filters' => true,
        ]);

        if (count($matches) > 1) {
            $paths = array_map(static fn (\WP_Post $candidate): string => self::pathOf($candidate), $matches);
            throw new AmbiguousPostSlugException(
                "Several \"{$postType}\" posts have the slug \"{$path}\": " . implode(', ', $paths) .
                '. Use the full path to pick one.',
            );
        }

        return $matches[0] ?? null;
    }

    /** The identity find() resolves: the full path for a hierarchical post, the slug otherwise. */
    public static function pathOf(\WP_Post $post): string
    {
        return is_post_type_hierarchical($post->post_type) ? (string) get_page_uri($post) : $post->post_name;
    }
}
