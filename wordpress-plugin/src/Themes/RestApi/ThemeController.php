<?php

declare(strict_types=1);

namespace Loopress\Themes\RestApi;

use Loopress\Infrastructure\Narrow;
use WP_REST_Request;
use WP_REST_Response;

/**
 * `lps theme activate`: the REST core can't switch themes (`wp/v2/themes` is read only).
 *
 * WordPress keeps theme mods and the Site Editor's Global Styles per stylesheet, so switching to
 * a child theme would drop the parent's. A child that has none of its own yet starts from a copy
 * of its parent's, the Loopress child (`<parent>-loopress`) being the case this is for.
 */
final class ThemeController
{
    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/theme/activate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'activate'],
            'permission_callback' => static fn(): bool => current_user_can('switch_themes'),
            'args'                => [
                'stylesheet' => ['required' => true, 'type' => 'string'],
            ],
        ]);
    }

    public function activate(WP_REST_Request $request): WP_REST_Response
    {
        $stylesheet = Narrow::string($request->get_param('stylesheet'));
        $previous   = get_stylesheet();
        if ($stylesheet === $previous) {
            return new WP_REST_Response(['active' => $stylesheet, 'previous' => $previous, 'changed' => false], 200);
        }

        $theme = wp_get_theme($stylesheet);
        if (!$theme->exists()) {
            return new WP_REST_Response(['error' => sprintf('The theme "%s" is not installed.', $stylesheet)], 404);
        }

        // A child whose parent is missing still exists(): switching to it would break the site.
        $errors = $theme->errors();
        if ($errors instanceof \WP_Error) {
            return new WP_REST_Response(['error' => sprintf('The theme "%s" can\'t be activated: %s', $stylesheet, $errors->get_error_message())], 409);
        }

        $parentTheme = $theme->get_template();
        if ($parentTheme !== $stylesheet) {
            $this->inheritParentState($parentTheme, $stylesheet);
        }

        switch_theme($stylesheet);
        if (class_exists('WP_Theme_JSON_Resolver')) {
            \WP_Theme_JSON_Resolver::clean_cached_data();
        }

        return new WP_REST_Response(['active' => $stylesheet, 'previous' => $previous, 'changed' => true], 200);
    }

    private function inheritParentState(string $parentTheme, string $child): void
    {
        $parentMods = get_option("theme_mods_{$parentTheme}");
        if (get_option("theme_mods_{$child}") === false && is_array($parentMods)) {
            update_option("theme_mods_{$child}", $parentMods);
        }

        if (!class_exists('WP_Theme_JSON_Resolver')) {
            return;
        }

        $parentStyles = \WP_Theme_JSON_Resolver::get_user_data_from_wp_global_styles(wp_get_theme($parentTheme));
        $parentContent = Narrow::string($parentStyles['post_content'] ?? null);
        if ($parentContent === '' || \WP_Theme_JSON_Resolver::get_user_data_from_wp_global_styles(wp_get_theme($child)) !== []) {
            return;
        }

        // Created by core, so it carries the right wp_theme term, then given the parent's content.
        $childStyles = \WP_Theme_JSON_Resolver::get_user_data_from_wp_global_styles(wp_get_theme($child), true);
        $childId     = Narrow::int($childStyles['ID'] ?? null);
        if ($childId !== 0) {
            wp_update_post(['ID' => $childId, 'post_content' => wp_slash($parentContent)]);
        }
    }
}
