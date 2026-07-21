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

// Deliberately loose: SeoService's active provider (RankMath or Yoast) reads/writes every one
// of its own plugin-prefixed postmeta keys generically (see RankMathService/YoastService's
// docblocks), so there's no fixed field list to model here either: whatever the active plugin
// stores round-trips through pull/push untouched.
export interface SeoPostMeta {
  meta: Record<string, unknown>
  slug: string
  title: string
}

// Only the active provider knowing how to handle redirects (RankMath does, Yoast doesn't, see
// SeoRedirectProvider) makes this endpoint fail with a clear error rather than return data, not
// a shape difference on success.
export interface SeoRedirect {
  createdAt: null | string
  headerCode: number
  hits: number
  id: number
  sources: unknown
  status: string
  updatedAt: null | string
  urlTo: string
}
