import {createTwoFilesPatch} from 'diff'
import {isDeepStrictEqual} from 'node:util'

// One resource's comparable state: identity -> canonical value. The value is whatever the
// resource's provider decides is worth comparing (a normalized object for snippets/pages, the
// raw plugin object for forms/ACF, a file's text for API routes), projected identically from
// both sides so a deep-equal check is meaningful.
export type ResourceState = Map<string, unknown>

export type StateChange = {
  id: string
  // Unified diff of the two values, ready to print. Empty string when the values are equal.
  patch: string
}

export type StateDiff = {
  added: string[]
  changed: StateChange[]
  removed: string[]
}

// Recursively sorts object keys so key ordering (which JSON.parse preserves from disk but a
// fresh API response may differ on) never shows up as a spurious change. Arrays keep their
// order, it's meaningful.
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2)
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortKeys(item))
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = sortKeys(source[key])
    }

    return sorted
  }

  return value
}

// A string value (an API route file) is diffed as-is: wrapping it in JSON quotes would turn
// every real change into one unreadable escaped line.
function toText(value: unknown): string {
  return typeof value === 'string' ? value : stableStringify(value)
}

// `left` is the reference (what things are compared against), `right` is the subject. For
// `lps diff` with no env-vs-env args that's remote (left) vs local (right), so `added` reads
// as "present locally, not on the site" and `removed` as "on the site, not locally".
export function compareStates(left: ResourceState, right: ResourceState, labels: {left: string; right: string}): StateDiff {
  const diff: StateDiff = {added: [], changed: [], removed: []}

  for (const id of right.keys()) {
    if (!left.has(id)) diff.added.push(id)
  }

  for (const id of left.keys()) {
    if (!right.has(id)) {
      diff.removed.push(id)
      continue
    }

    const leftValue = left.get(id)
    const rightValue = right.get(id)
    if (isDeepStrictEqual(leftValue, rightValue)) continue

    const leftText = toText(leftValue)
    const rightText = toText(rightValue)
    const patch = createTwoFilesPatch(id, id, ensureTrailingNewline(leftText), ensureTrailingNewline(rightText), labels.left, labels.right)
    diff.changed.push({id, patch})
  }

  diff.added.sort((a, b) => a.localeCompare(b))
  diff.removed.sort((a, b) => a.localeCompare(b))
  diff.changed.sort((a, b) => a.id.localeCompare(b.id))
  return diff
}

// createTwoFilesPatch treats a missing final newline as a "\ No newline at end of file"
// hunk line, noise when both sides lack it; normalize so that only real differences surface.
function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : text + '\n'
}

export function isEmptyDiff(diff: StateDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0
}
