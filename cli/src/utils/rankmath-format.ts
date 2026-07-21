// Post types synced by `lps rankmath pull` when --post-type isn't given.
export const DEFAULT_POST_TYPES = ['post', 'page'] as const

export const RANKMATH_SETTINGS_ENDPOINT = 'loopress/v1/rankmath/settings'
export const RANKMATH_REDIRECTS_ENDPOINT = 'loopress/v1/rankmath/redirects'

export function rankmathRedirectEndpoint(id: number): string {
  return `${RANKMATH_REDIRECTS_ENDPOINT}/${id}`
}

export function rankmathPostMetaEndpoint(postType: string): string {
  return `loopress/v1/rankmath/post-meta/${postType}`
}

// Deliberately loose: RankMathService reads/writes every `rank_math_*` postmeta key generically
// (see its docblock), so there's no fixed field list to model here either: whatever RankMath
// itself stores round-trips through pull/push untouched.
export interface RankMathPostMeta {
  meta: Record<string, unknown>
  slug: string
  title: string
}

export interface RankMathRedirect {
  createdAt: null | string
  headerCode: number
  hits: number
  id: number
  sources: unknown
  status: string
  updatedAt: null | string
  urlTo: string
}
