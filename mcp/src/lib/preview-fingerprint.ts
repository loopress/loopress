// A deterministic stand-in for "the state a preview was computed from". Comparing two
// fingerprints answers "would this command's own --dry-run still say the same thing right now",
// without the confirm-token layer needing to know what any given command's preview actually
// inspects (a resource's remote state for rollback, local files only for a plain push, ...).
// JSON.stringify's key order follows insertion order, which is stable for values built by our
// own code but not guaranteed in general, so keys are sorted recursively before stringifying.
export function fingerprintPreview(data: unknown): string {
  return JSON.stringify(sortKeysDeep(data))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)

  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }

    return sorted
  }

  return value
}
