export const ACF_OBJECT_TYPES = ['field-groups', 'post-types', 'taxonomies', 'options-pages'] as const
export type AcfObjectType = (typeof ACF_OBJECT_TYPES)[number]

export function acfEndpoint(type: AcfObjectType): string {
  return `loopress/v1/acf/${type}`
}

// Deliberately loose: ACF's own export JSON is large, deeply nested, and versioned by ACF
// itself (new settings appear across ACF releases). We only need `key` for filenames/identity;
// everything else round-trips through pull/push untouched, so there's no generated type for it
// (see the plan for why: shadowing ACF's own schema would be an ongoing losing battle, and the
// shared schema:types compiler options (additionalProperties: false) would be actively wrong here).
export function getAcfKey(data: Record<string, unknown>): null | string {
  return typeof data.key === 'string' && data.key.trim() !== '' ? data.key : null
}
