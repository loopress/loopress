import {isDeepStrictEqual} from 'node:util'

export const ACF_OBJECT_TYPES = ['field-groups', 'post-types', 'taxonomies', 'options-pages'] as const
export type AcfObjectType = (typeof ACF_OBJECT_TYPES)[number]

export function acfEndpoint(type: AcfObjectType): string {
  return `loopress/v1/acf/${type}`
}

// GET/DELETE route for a single object by key, used by `acf push` to read the object's current
// revision right before writing it (see acf/push.ts, #234). Create/update both go through
// acfEndpoint() (a POST), the controller resolves create-vs-update server-side via `key`.
export function acfObjectEndpoint(type: AcfObjectType, key: string): string {
  return `${acfEndpoint(type)}/${key}`
}

// POST route returning local objects the way the site would store them, defaults filled in,
// nothing saved (see resource-state.ts's acfProvider).
export function acfNormalizeEndpoint(type: AcfObjectType): string {
  return `loopress/v1/acf/normalize/${type}`
}

// Deliberately loose: ACF's own export JSON is large, deeply nested, and versioned by ACF
// itself (new settings appear across ACF releases). We only need `key` for filenames/identity;
// everything else round-trips through pull/push untouched, so there's no generated type for it
// (see the plan for why: shadowing ACF's own schema would be an ongoing losing battle, and the
// shared schema:types compiler options (additionalProperties: false) would be actively wrong here).
export function getAcfKey(data: Record<string, unknown>): null | string {
  return typeof data.key === 'string' && data.key.trim() !== '' ? data.key : null
}

type AcfField = Record<string, unknown> & {key?: unknown; name?: unknown}

function topLevelFields(group: unknown): Map<string, AcfField> {
  const fields = (group as undefined | {fields?: unknown})?.fields
  const byKey = new Map<string, AcfField>()
  for (const field of Array.isArray(fields) ? (fields as AcfField[]) : []) {
    if (typeof field?.key === 'string') byKey.set(field.key, field)
  }

  return byKey
}

function label(field: AcfField): string {
  return typeof field.name === 'string' && field.name !== '' ? field.name : String(field.key)
}

// A changed field group's top-level fields, matched by `key` and named by `name` (a repeater's
// sub-field change shows as its parent changing). Only for the dry-run preview: the push itself
// always sends the whole group.
export function acfFieldChanges(before: unknown, after: unknown): {added: string[]; changed: string[]; removed: string[]} {
  const old = topLevelFields(before)
  const next = topLevelFields(after)
  const changes = {added: [] as string[], changed: [] as string[], removed: [] as string[]}
  for (const [key, field] of next) {
    if (!old.has(key)) changes.added.push(label(field))
    else if (!isDeepStrictEqual(old.get(key), field)) changes.changed.push(label(field))
  }

  for (const [key, field] of old) if (!next.has(key)) changes.removed.push(label(field))
  return changes
}
