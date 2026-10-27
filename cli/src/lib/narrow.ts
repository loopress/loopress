// Type guards for values that arrive as `unknown`: a caught error, a parsed JSON document.
// Arrays pass isRecord, same as a bare `typeof value === 'object' && value !== null` check.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Membership in a closed list of literals, narrowing `value` to that union.
export function isOneOf<T extends string>(values: Iterable<T>, value: unknown): value is T {
  for (const candidate of values) if (candidate === value) return true
  return false
}

// `.message` of anything thrown: an Error, or an object shaped like one (got and oclif errors
// are both). Anything else is stringified rather than read as `undefined`.
export function errorMessage(error: unknown): string {
  return isRecord(error) && typeof error.message === 'string' ? error.message : String(error)
}

// The error a rethrown one wraps (`new Error(message, {cause})`), e.g. the got error behind
// WpClient's formatted one.
export function causeOf(error: unknown): unknown {
  return isRecord(error) ? error.cause : undefined
}

// Node's errno code ('ENOENT', 'EEXIST', ...) when the thrown value carries one.
export function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined
}
