import {toSlug} from './to-slug.js'

// Post types synced by `lps seo pull` when --post-type isn't given.
export const DEFAULT_POST_TYPES = ['post', 'page'] as const

export const SEO_SETTINGS_ENDPOINT = 'loopress/v1/seo/settings'
export const SEO_REDIRECTS_ENDPOINT = 'loopress/v1/seo/redirects'

export function seoRedirectEndpoint(id: number): string {
  return `${SEO_REDIRECTS_ENDPOINT}/${id}`
}

export function seoPostMetaEndpoint(postType: string): string {
  return `loopress/v1/seo/post-meta/${postType}`
}

export function seoPostMetaItemEndpoint(postType: string, slug: string): string {
  return `${seoPostMetaEndpoint(postType)}/${encodeURIComponent(slug)}`
}

// Deliberately loose: SeoService's active provider (RankMath or Yoast) reads/writes every one
// of its own plugin-prefixed postmeta keys generically (see RankMathService/YoastService's
// docblocks), so there's no fixed field list to model here either: whatever the active plugin
// stores round-trips through pull/push untouched.
export type SeoPostMeta = {
  meta: Record<string, unknown>
  slug: string
  title: string
}

// GET /seo/post-meta/{type}/{slug}'s shape (a single post): carries a `revision`, the same
// content-hash conditional-write precondition `option` uses (#234), on top of SeoPostMeta.
// Never persisted locally (see `seo pull`'s pullPostMeta, which strips it before writing to
// disk), only ever read fresh right before a push, same as RemoteOption.revision.
export type RemoteSeoPostMeta = SeoPostMeta & {revision: string}

// GET/PUT /seo/settings's shape: wrapped (unlike the bare settings object every earlier version
// of this endpoint returned) so a `revision` can travel alongside the settings without being
// mistaken for one of them, see SeoService::getSettings()'s docblock. `settings` alone is what
// `seo pull`/`seo push` read and write to/from settings.json, never `revision` (same "never
// persisted locally" rule as RemoteOption.revision).
export type RemoteSeoSettings = {
  revision: string
  settings: Record<string, unknown>
}

// Only the active provider knowing how to handle redirects (RankMath does, Yoast doesn't, see
// SeoRedirectProvider) makes this endpoint fail with a clear error rather than return data, not
// a shape difference on success.
export type SeoRedirect = {
  createdAt: string | undefined
  headerCode: number
  hits: number
  id: number
  sources: unknown
  status: string
  updatedAt: string | undefined
  urlTo: string
}

// The `<id>-<slug>.json` on-disk convention shared by `seo pull` and `seo push`.
export function redirectFileBase(redirect: SeoRedirect): string {
  return `${redirect.id}-${toSlug(redirect.urlTo, 'redirect')}`
}
