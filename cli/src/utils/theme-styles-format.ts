import {type WpClient} from '../lib/wp-client.js'

// Global Styles are the user's customizations from the Site Editor's "Styles" screen (colors,
// typography, spacing), stored by WordPress core in a `wp_global_styles` post, one per theme.
// This is separate from the theme's own theme.json file, which lives in the theme's repo and is
// out of scope here. Only block themes (Full Site Editing) have a Styles screen at all.

export const THEME_STYLES_FILE_SUFFIX = '-global-styles.json'

export function themeStylesFileName(stylesheet: string): string {
  return `${stylesheet}${THEME_STYLES_FILE_SUFFIX}`
}

export function globalStylesEndpoint(id: number): string {
  return `wp/v2/global-styles/${id}`
}

export type WpThemeSupportInfo = {
  _links?: Record<string, Array<{href: string}>>
  status: 'active' | 'inactive'
  stylesheet: string
  theme_supports?: Record<string, unknown>
}

// WordPress core surfaces `wp_is_block_theme()` over the `wp/v2/themes` REST response as
// `theme_supports['block-templates']` (see `_add_default_theme_supports()` in
// wp-includes/theme.php): core adds that feature flag itself exactly when the theme has its own
// block templates. No Loopress-side controller is needed to detect this.
export function isBlockTheme(theme: Pick<WpThemeSupportInfo, 'theme_supports'>): boolean {
  return theme.theme_supports?.['block-templates'] === true
}

// The `wp/v2/themes` list item links to its theme's editable `wp_global_styles` post under this
// core-defined relation rather than exposing the id as a plain field (the same relation
// @wordpress/e2e-test-utils-playwright's `getCurrentThemeGlobalStylesPostId()` reads). The href
// itself varies with the site's permalink structure (`?rest_route=/wp/v2/global-styles/123` vs
// `/wp-json/wp/v2/global-styles/123`), so the id is pulled out with a regex rather than assumed
// to be the URL's last path segment.
const USER_GLOBAL_STYLES_REL = 'wp:user-global-styles'

export function getUserGlobalStylesId(theme: Pick<WpThemeSupportInfo, '_links'>): null | number {
  const href = theme._links?.[USER_GLOBAL_STYLES_REL]?.[0]?.href
  if (!href) return null

  const match = /\/wp\/v2\/global-styles\/(\d+)/.exec(href)
  return match ? Number(match[1]) : null
}

// Resolves the active theme's stylesheet slug and the id of its editable Global Styles post in
// one call, failing clearly (rather than with a raw REST error later) when the active theme
// isn't a block theme: classic themes have no Styles screen and no `wp_global_styles` post at all.
export async function getActiveThemeGlobalStyles(wp: WpClient): Promise<{id: number; stylesheet: string}> {
  const themes = await wp.get<WpThemeSupportInfo[]>('wp/v2/themes')
  const active = themes.find((theme) => theme.status === 'active')
  if (!active) throw new Error('Could not determine the active theme on WordPress.')

  if (!isBlockTheme(active)) {
    throw new Error(
      `Global Styles sync only supports block themes (Full Site Editing). The active theme "${active.stylesheet}" is a classic theme.`,
    )
  }

  const id = getUserGlobalStylesId(active)
  if (id === null) {
    throw new Error(
      `Could not resolve the editable Global Styles post for "${active.stylesheet}". Requires an admin-capable account (edit_theme_options) on WordPress 5.9+.`,
    )
  }

  return {id, stylesheet: active.stylesheet}
}

export type GlobalStylesRecord = {
  settings?: Record<string, unknown>
  styles?: Record<string, unknown>
}

// The compared/stored value: `settings` and `styles` only. `id` and `_links` are WordPress
// bookkeeping, not part of the tracked configuration (a fresh install resolves to a different
// id for the same content), so they're dropped rather than becoming spurious drift.
export function canonicalGlobalStyles(record: {settings?: unknown; styles?: unknown}): Record<string, unknown> {
  return {settings: record.settings ?? {}, styles: record.styles ?? {}}
}
