import {toSlug} from './to-slug.js'

// WordPress core's own REST endpoint (`wp/v2/pages`), unlike acf/form/seo/snippet there is no
// Loopress-plugin controller behind this one, same principle as `wp/v2/plugins` in plugin push/pull.
export const PAGE_ENDPOINT = 'wp/v2/pages'

// ponytail: fixed cap, not a paged loop; fine for typical page counts, revisit with real
// pagination (X-WP-TotalPages) if a site ever has more than 100 pages.
export const PAGE_LIST_QUERY = 'per_page=100'

export function getPageId(data: Record<string, unknown>): number | undefined {
  const id = Number(data.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

// `title`/`content`/`excerpt` come back as `{raw, rendered}` from `?context=edit` (what `page
// pull` requests) but round-trip fine as plain strings too for a hand-created file, same
// looseness as getFormTitle in form-format.ts.
export function getPageTitle(data: Record<string, unknown>): string {
  const {title} = data
  if (typeof title === 'string' && title.trim() !== '') return title

  if (title && typeof title === 'object') {
    const {raw, rendered} = title as Record<string, unknown>
    if (typeof raw === 'string' && raw.trim() !== '') return raw
    if (typeof rendered === 'string' && rendered.trim() !== '') return rendered
  }

  return '(untitled)'
}

export function pageFileBase(id: number, title: string): string {
  return `${id}-${toSlug(title, 'untitled')}`
}

// The fields WordPress core actually accepts on write to `wp/v2/pages` (confirmed via
// `OPTIONS wp/v2/pages`), plus `id` for local identity. A GET response carries a lot more:
// `guid`, `link`, `modified`/`modified_gmt`, `permalink_template`, `generated_slug`,
// `class_list`, `type`, `_links`, all of it readonly/computed by WordPress, most of it
// domain- or revision-specific. `_links` alone is the bulk of the file and, like
// `modified`/`modified_gmt`, changes on every edit regardless of whether the page's actual
// content changed, which would make every `page pull` produce a spurious git diff if kept.
const PAGE_META_FIELDS = [
  'id',
  'date',
  'date_gmt',
  'slug',
  'status',
  'password',
  'parent',
  'title',
  'author',
  'excerpt',
  'featured_media',
  'comment_status',
  'ping_status',
  'menu_order',
  'meta',
  'template',
] as const

export function pickPageMeta(data: Record<string, unknown>): Record<string, unknown> {
  const meta: Record<string, unknown> = {}
  for (const field of PAGE_META_FIELDS) {
    if (Object.hasOwn(data, field)) meta[field] = data[field]
  }

  return meta
}

// `content` comes back as `{raw, rendered}` from `?context=edit` (what `page pull` requests);
// a hand-created file only has the plain string. This is the one field split out into its own
// `.html` file by pull/push: raw Gutenberg block markup escaped inside a JSON string is neither
// readable nor safely hand-editable, same reasoning as the code/meta split in snippet-format.ts.
export function getPageContent(data: Record<string, unknown>): string {
  const {content} = data
  if (typeof content === 'string') return content

  if (content && typeof content === 'object') {
    const {raw} = content as Record<string, unknown>
    if (typeof raw === 'string') return raw
  }

  return ''
}
