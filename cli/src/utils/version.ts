import {compareVersions as cmp, validate} from 'compare-versions'

// An exact version like 9.4.2 or 3.0.0-beta1, not a Composer constraint (^, ~, *, ranges,
// ||, x-wildcards). loopress.json pins an exact version or the literal "latest"; a constraint
// breaks the CLI's drift detection (it never string-equals the resolved version), so it is
// rejected at `add` time. Not `compare-versions`' `validate()`: that accepts "9.4.x".
const EXACT_VERSION = /^\d+(\.\d+){0,3}(-[0-9A-Za-z.]+)?$/

export function isExactVersion(value: string): boolean {
  return EXACT_VERSION.test(value)
}

// -1 / 0 / 1, or null when either side isn't a comparable version (e.g. "latest"). Wraps
// compare-versions so callers never have to guard against the throw it does on bad input.
export function compareVersions(a: string, b: string): null | number {
  return validate(a) && validate(b) ? cmp(a, b) : null
}
