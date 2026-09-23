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
}
