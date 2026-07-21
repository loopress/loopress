// Post types synced by `lps yoast pull` when --post-type isn't given.
export const DEFAULT_POST_TYPES = ['post', 'page'] as const

export const YOAST_SETTINGS_ENDPOINT = 'loopress/v1/yoast/settings'

export function yoastPostMetaEndpoint(postType: string): string {
  return `loopress/v1/yoast/post-meta/${postType}`
}

// Deliberately loose: YoastService reads/writes every `_yoast_wpseo_*` postmeta key generically
// (see its docblock), so there's no fixed field list to model here either: whatever Yoast
// itself stores round-trips through pull/push untouched.
export interface YoastPostMeta {
  meta: Record<string, unknown>
  slug: string
  title: string
}
