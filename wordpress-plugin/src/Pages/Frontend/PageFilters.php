<?php

declare(strict_types=1);

namespace Loopress\Pages\Frontend;

use Loopress\Pages\ManagedPage;
use WP_Post;

/**
 * Everything that makes a managed page behave as "the file is the source" once it's on the
 * site: rendering from the meta instead of post_content, and closing the wp-admin editor.
 */
class PageFilters
{
    // wpautop's priority when renderContent() unhooked it for the page being rendered, so
    // restoreAutop() can put it back for whatever the_content renders next (a widget, another
    // post in a loop). Null when nothing was unhooked.
    private ?int $removedAutopPriority = null;

    public function register(): void
    {
        // Priority 0: ahead of do_blocks (9), wpautop (10) and do_shortcode (11), so the HTML
        // still gets shortcodes, oEmbed and image lazy-loading like any page content would.
        add_filter('the_content', [$this, 'renderContent'], 0);
        add_filter('the_content', [$this, 'restoreAutop'], PHP_INT_MAX);
        add_filter('map_meta_cap', [$this, 'blockEditing'], 10, 4);
        add_filter('display_post_states', [$this, 'addPostState'], 10, 2);
        add_filter('page_row_actions', [$this, 'addPreviewRowAction'], 10, 2);
        add_action('wp_head', [$this, 'printPageStyles']);
    }

    // Only the page's own body is replaced, recognized by being empty (post_content always is for
    // a managed page, and that's what the theme, the post-content block and excerpts pass in).
    // Any other string run through the_content while this page is the global post belongs to
    // someone else and is left alone: a plugin rendering its own text, and above all a shortcode
    // inside the page calling the_content on its inner content, which would otherwise get the
    // whole page back, shortcode included, and recurse until PHP runs out of stack. This also
    // keeps a password set outside Loopress (WP-CLI, SQL) effective: WordPress then passes the
    // non-empty password form as $content, which is left as is.
    public function renderContent(mixed $content): mixed
    {
        $postId = (int) get_the_ID();
        if (!is_string($content) || trim($content) !== '' || !ManagedPage::isManaged($postId)) {
            return $content;
        }

        // wpautop would sprinkle <p>/<br> into hand-written HTML. Unhooked for this page only;
        // restoreAutop() puts it back at the end of this same the_content run.
        $priority = has_filter('the_content', 'wpautop');
        if (is_int($priority)) {
            remove_filter('the_content', 'wpautop', $priority);
            $this->removedAutopPriority = $priority;
        }

        return (string) get_post_meta($postId, ManagedPage::HTML_META, true);
    }

    public function restoreAutop(mixed $content): mixed
    {
        if ($this->removedAutopPriority !== null) {
            add_filter('the_content', 'wpautop', $this->removedAutopPriority);
            $this->removedAutopPriority = null;
        }

        return $content;
    }

    /**
     * No editor, Quick Edit or bulk edit for a managed page: its content, slug, status and
     * template come from `lps page push`, which writes through wp_update_post() and never
     * checks a capability. delete_post is left alone on purpose, trashing stays a human choice.
     *
     * @param string[] $caps
     * @param array<int, mixed> $args
     * @return string[]
     */
    public function blockEditing(array $caps, string $cap, int $userId, array $args): array
    {
        if (($cap === 'edit_post' || $cap === 'edit_page') && ManagedPage::isManaged((int) ($args[0] ?? 0))) {
            // WordPress's own draft preview (front end, ?preview=true) gates on this same
            // capability but never writes anything, so it's exempt. Every real write path
            // (post.php, Quick/bulk edit, the block editor's REST PATCH) runs with is_preview()
            // false and stays blocked.
            if (is_preview() || get_query_var('preview')) {
                return $caps;
            }

            return ['do_not_allow'];
        }

        return $caps;
    }

    /**
     * @param array<string, string> $states
     * @return array<string, string>
     */
    public function addPostState(array $states, WP_Post $post): array
    {
        if (ManagedPage::isManaged($post->ID)) {
            $states['loopress'] = __('Managed by Loopress', 'loopress');
        }

        return $states;
    }

    // WP_Posts_List_Table only adds its own "Preview" row action when current_user_can('edit_post')
    // is true, which blockEditing() denies for a managed page outside of the preview request
    // itself. The link it would have generated is safe to show unconditionally though: it only
    // ever points at the same read-only preview URL that check now exempts.
    /**
     * @param array<string, string> $actions
     * @return array<string, string>
     */
    public function addPreviewRowAction(array $actions, WP_Post $post): array
    {
        if (isset($actions['view']) || !ManagedPage::isManaged($post->ID) || !in_array($post->post_status, ['draft', 'pending', 'future'], true)) {
            return $actions;
        }

        $actions['view'] = sprintf(
            '<a href="%s" rel="bookmark" aria-label="%s">%s</a>',
            esc_url((string) get_preview_post_link($post)),
            /* translators: %s: Post title. */
            esc_attr(sprintf(__('Preview &#8220;%s&#8221;'), $post->post_title)),
            _x('Preview', 'verb')
        );

        return $actions;
    }

    // Scoped by the post's own body class (core, present on every theme) rather than a class
    // baked into the pushed HTML, so `full-width`/`hide-title` work the same regardless of what
    // markup the page author wrote. The two custom properties are WordPress's own block layout
    // API (set from theme.json, read by every block-theme's "constrained" layout CSS), so
    // overriding them here is a core mechanism, not a guess at this theme's class names. On a
    // classic (non-block) theme neither property nor `.wp-block-post-title` exists, so this is a
    // silent no-op there, not a broken layout: full width and title placement on those themes are
    // controlled by PHP templates, which this can't reach.
    public function printPageStyles(): void
    {
        if (!is_page()) {
            return;
        }

        $postId = get_queried_object_id();
        if (!ManagedPage::isManaged($postId)) {
            return;
        }

        $fullWidth = get_post_meta($postId, ManagedPage::FULL_WIDTH_META, true) === '1';
        $hideTitle = get_post_meta($postId, ManagedPage::HIDE_TITLE_META, true) === '1';
        if (!$fullWidth && !$hideTitle) {
            return;
        }

        // body_class() puts a page under "page-id-<id>", not "postid-<id>" (that's for posts).
        $selector = sprintf('body.page-id-%d', $postId);
        $rules    = [];

        if ($fullWidth) {
            // Scoped to .wp-block-post-content itself, not body: a custom property set on body
            // inherits into the header/footer template parts too, widening them along with the
            // page. content-size/wide-size drop the "constrained" layout's max-width; root
            // padding is a separate global-styles mechanism (.has-global-padding), the side
            // gutter kept even on a full-width block, so it also has to go for the page to reach
            // the true edge.
            $rules[] = "{$selector} .wp-block-post-content { --wp--style--global--content-size: none; --wp--style--global--wide-size: none; "
                . '--wp--style--root--padding-left: 0px; --wp--style--root--padding-right: 0px; }';
        }

        if ($hideTitle) {
            $rules[] = "{$selector} .wp-block-post-title { display: none; }";
        }

        echo '<style id="loopress-page-styles">' . implode(' ', $rules) . '</style>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}
