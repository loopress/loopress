<?php

declare(strict_types=1);

namespace Loopress\Pages;

/**
 * The two post metas that make a WordPress page "managed by Loopress". Both keys start with
 * '_' on purpose: without it WordPress lists them in the "Custom Fields" panel and lets
 * anyone edit them there, which would bypass the whole "the file is the source" rule.
 * post_content is never read nor written for these pages, the HTML lives only in HTML_META.
 */
final class ManagedPage
{
    public const MARKER_META     = '_loopress_page';
    public const HTML_META       = '_loopress_page_html';
    public const FULL_WIDTH_META = '_loopress_page_full_width';
    public const HIDE_TITLE_META = '_loopress_page_hide_title';

    public static function isManaged(int $postId): bool
    {
        return $postId > 0
            && get_post_type($postId) === 'page'
            && get_post_meta($postId, self::MARKER_META, true) === '1';
    }
}
