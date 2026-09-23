// A deterministic stand-in for "the state a preview was computed from". Comparing two
// fingerprints answers "would this command's own --dry-run still say the same thing right now",
// without the confirm-token layer needing to know what any given command's preview actually
// inspects (a resource's remote state for rollback, local files only for a plain push, ...).
// JSON.stringify's key order follows insertion order, which is stable for values built by our
// own code but not guaranteed in general, so keys are sorted recursively before stringifying.
export function fingerprintPreview(data: unknown): string {
  // JSON.stringify(undefined) is `undefined`, not a string (lib.es5.d.ts's `string` return type
  // doesn't reflect that). Every real caller's `data` comes from JSON.parse()-ing a CLI's JSON
  // output, which can never itself be undefined, but the parameter here is `unknown`, so a
  // defined fallback keeps the contract honest for any other caller.
  return JSON.stringify(sortKeysDeep(data)) ?? 'undefined'
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)

  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    // Explicit comparator: the default `.sort()` would already order these correctly (object
    // keys are always strings), but is ordinal by UTF-16 code unit, not locale-aware, and this
    // is exactly what the ordering needs to stay deterministic across environments/locales.
    for (const key of Object.keys(value as Record<string, unknown>).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }

    return sorted
  }

  return value
}
