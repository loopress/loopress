import {resolve} from 'node:path'

import {readdirTolerant} from '../lib/readdir-tolerant.js'
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
  template?: string
  theme_supports?: Record<string, unknown>
}

// Appended to the parent's stylesheet by the plugin's ChildThemeController.
export const CHILD_THEME_SUFFIX = '-loopress'

// The stylesheet a project's Global Styles file is named after: the parent's when the Loopress
// child is active, so the tracked file stays the same whether or not the child was activated
// (the plugin copies the parent's Global Styles into the child when activating it).
export function projectStylesheet(theme: Pick<WpThemeSupportInfo, 'stylesheet' | 'template'>): string {
  const {stylesheet, template} = theme
  return template && stylesheet === `${template}${CHILD_THEME_SUFFIX}` ? template : stylesheet
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

async function getActiveTheme(wp: WpClient): Promise<WpThemeSupportInfo> {
  const themes = await wp.get<WpThemeSupportInfo[]>('wp/v2/themes')
  const active = themes.find((theme) => theme.status === 'active')
  if (!active) throw new Error('Could not determine the active theme on WordPress.')
  return active
}

// The project's Global Styles files, one per theme it was pulled from. None: the project doesn't
// track them.
export async function globalStylesFiles(dir: string): Promise<string[]> {
  return (await readdirTolerant(resolve(dir))).filter((file) => file.endsWith(THEME_STYLES_FILE_SUFFIX))
}

// Why the aggregate `lps push` / `lps pull` leave Global Styles out of this run, or undefined to
// include them. Only a project that tracks them (a `*-global-styles.json` file in `dir`) on a
// site whose active theme is a block theme qualifies: unlike `lps theme style push`, a classic
// theme is no error there, the rest of the run must go on. A push also needs the active theme's
// own file, there is nothing to send otherwise.
export async function globalStylesSkipNote(wp: WpClient, dir: string, action: 'pull' | 'push'): Promise<string | undefined> {
  const files = await globalStylesFiles(dir)
  if (files.length === 0) return 'not configured, skipped'

  const active = await getActiveTheme(wp)
  if (!isBlockTheme(active)) return `the active theme "${active.stylesheet}" is a classic theme, skipped`
  if (action === 'push' && !files.includes(themeStylesFileName(projectStylesheet(active)))) {
    return `no file for the active theme "${projectStylesheet(active)}", skipped`
  }

  return undefined
}

// Resolves the active theme's stylesheet slug, as the project names it (see projectStylesheet),
// and the id of its editable Global Styles post in one call, failing clearly (rather than with a raw REST error later) when the active theme
// isn't a block theme: classic themes have no Styles screen and no `wp_global_styles` post at all.
export async function getActiveThemeGlobalStyles(wp: WpClient): Promise<{id: number; stylesheet: string}> {
  const active = await getActiveTheme(wp)
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

  return {id, stylesheet: projectStylesheet(active)}
}

export type GlobalStylesRecord = {
  settings?: Record<string, unknown>
  styles?: Record<string, unknown>
}

// The compared/stored value: `settings` and `styles` only. `id` and `_links` are WordPress
// bookkeeping, not part of the tracked configuration (a fresh install resolves to a different
// id for the same content), so they're dropped rather than becoming spurious drift.
// WordPress also rewrites two things on save, so both sides take its stored form, or a file
// pushed as is would read as drift right after its push:
// - a preset list (`palette: [...]`) is keyed by its origin, `palette: {custom: [...]}`, and
// - a `var:preset|color|base` reference becomes `var(--wp--preset--color--base)`.
export function canonicalGlobalStyles(record: {settings?: unknown; styles?: unknown}): Record<string, unknown> {
  return {settings: expandVarReferences(unwrapPresets(record.settings ?? {})), styles: expandVarReferences(record.styles ?? {})}
}

const PRESET_KEYS = new Set(['aspectRatios', 'duotone', 'fontFamilies', 'fontSizes', 'gradients', 'palette', 'presets', 'radiusSizes', 'spacingSizes'])

function unwrapPresets(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.map((item) => unwrapPresets(item))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]: [string, unknown]) => {
      const custom = PRESET_KEYS.has(key) && isOnlyCustom(item) ? item.custom : item
      return [key, unwrapPresets(custom)]
    }),
  )
}

function isOnlyCustom(value: unknown): value is {custom: unknown[]} {
  return typeof value === 'object' && value !== null && Object.keys(value).length === 1 && Array.isArray((value as {custom?: unknown}).custom)
}

// WP_Theme_JSON::convert_custom_properties()'s rule.
function expandVarReferences(value: unknown): unknown {
  if (typeof value === 'string') return value.startsWith('var:') ? `var(--wp--${value.slice(4).replaceAll('|', '--')})` : value
  if (typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.map((item) => expandVarReferences(item))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandVarReferences(item)]))
}
