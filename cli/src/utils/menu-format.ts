export const MENU_ENDPOINT = 'loopress/v1/menus'
export const MENU_LOCATIONS_ENDPOINT = 'loopress/v1/menu-locations'

export function menuEndpoint(slug: string): string {
  return `${MENU_ENDPOINT}/${encodeURIComponent(slug)}`
}

// Only the three item types MenuService resolves by identity: `object`/`objectSlug` are the
// target's own post type/taxonomy and slug for `post_type`/`taxonomy`, never a raw
// `_menu_item_object_id` (not portable between environments, see MenuService's docblock); `url`
// is only meaningful for `custom`. `children` is the item's own nested items, in order, not a
// flat parent-id list, so the file stays a readable tree and a sensible git diff.
export type MenuItem = {
  children: MenuItem[]
  classes: string[]
  description: string
  object: null | string
  objectSlug: null | string
  target: string
  title: string
  type: 'custom' | 'post_type' | 'taxonomy'
  url: null | string
  xfn: string
}

export type Menu = {
  items: MenuItem[]
  name: string
  slug: string
  // Diagnostics only (a dangling item, an unsupported item type, a custom URL pointing
  // off-environment): never part of the tracked configuration, see resource-state.ts.
  warnings: string[]
}

// location => menu slug, or null when unassigned. Scoped to whichever theme is active on
// whichever environment answered the request (a theme_mod, see MenuService::getLocations()).
export type MenuLocations = Record<string, null | string>

export function getMenuSlug(data: Record<string, unknown>): null | string {
  return typeof data.slug === 'string' && data.slug.trim() !== '' ? data.slug : null
}
