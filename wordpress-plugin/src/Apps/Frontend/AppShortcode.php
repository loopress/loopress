<?php

declare(strict_types=1);

namespace Loopress\Apps\Frontend;

use Loopress\Apps\Infrastructure\AppStore;

/**
 * `[loopress_app name="search"]`: enqueues the app's built assets and prints the mount point
 * the SPA attaches to. Works in the classic editor, the Gutenberg shortcode block, and every
 * page builder that runs shortcodes through `do_shortcode`. A dedicated Gutenberg block is a
 * later addition, not a replacement.
 */
class AppShortcode
{
    public const TAG = 'loopress_app';

    public function __construct(
        private AppStore $store,
        private AppAssetEnqueuer $enqueuer,
    ) {}

    /**
     * WordPress passes `''` for a shortcode with no attributes, an assoc array otherwise.
     * `$content` and `$tag` complete the `do_shortcode` callback signature; this shortcode
     * is self-closing and single-purpose, so neither is read.
     *
     * @param array<array-key, string>|string $atts
     */
    public function render(array|string $atts, ?string $content = null, string $tag = self::TAG): string
    {
        $atts = shortcode_atts(['name' => ''], is_array($atts) ? $atts : [], self::TAG);
        $name = sanitize_key((string) $atts['name']);

        $record = $name === '' ? null : $this->store->get($name);
        if ($record === null) {
            // Visible only in page source, never rendered: enough for a developer to see why
            // nothing showed up, without leaking anything to a visitor.
            return '<!-- loopress_app: no committed build for "' . esc_html((string) $atts['name']) . '" -->';
        }

        $this->enqueuer->enqueue($name);

        $mountId = ltrim(is_string($record['mountSelector'] ?? null) ? $record['mountSelector'] : "#loopress-app-{$name}", '#');

        return sprintf('<div id="%s" data-loopress-app="%s"></div>', esc_attr($mountId), esc_attr($name));
    }
}
