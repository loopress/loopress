import {createTwoFilesPatch} from 'diff'
import microdiff from 'microdiff'
import {isDeepStrictEqual} from 'node:util'

// One resource's comparable state: identity -> canonical value. The value is whatever the
// resource's provider decides is worth comparing (a normalized object for snippets, the
// raw plugin object for forms/ACF, a file's text for API routes), projected identically from
// both sides so a deep-equal check is meaningful.
export type ResourceState = Map<string, unknown>

export type FieldChange = {
  from?: unknown
  kind: 'added' | 'changed' | 'removed'
  // Dot path to the leaf that changed, e.g. `settings.notifications.1.email`.
  path: string
  to?: unknown
}

export type StateChange = {
  // Structured per-leaf changes, present for object values (absent for text values like an API
  // route file or a hook file, which only get `patch`).
  fields?: FieldChange[]
  id: string
  // Human-readable rendering of the change, ready to print (a per-field list for objects, a
  // header-less unified diff for text).
  patch: string
}

export type StateDiff = {
  added: string[]
  changed: StateChange[]
  removed: string[]
}

const MAX_VALUE_LENGTH = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatValue(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value)
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text
}

// createTwoFilesPatch treats a missing final newline as a "\ No newline at end of file" hunk
// line, noise when both sides lack it; normalize so only real differences surface.
function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

// Two strings (an API route file, a hook file, composer.json): a real line diff. Only the
// `Index:` / `===` preamble createTwoFilesPatch emits is dropped; the `--- <left>` / `+++
// <right>` lines are kept so each hunk still states its own direction.
function renderTextChange(id: string, left: string, right: string, labels: {left: string; right: string}): string {
  const patch = createTwoFilesPatch(id, id, ensureTrailingNewline(left), ensureTrailingNewline(right), labels.left, labels.right)
  const lines = patch.split('\n')
  const start = lines.findIndex((line) => line.startsWith('--- '))
  return (start === -1 ? lines : lines.slice(start)).join('\n').trimEnd()
}

// Two objects: microdiff walks them structurally and returns one entry per changed leaf, so
// key ordering never matters and a big nested blob (a WPForms definition, an ACF group)
// reduces to just the fields that moved.
function objectFieldChanges(left: Record<string, unknown>, right: Record<string, unknown>): FieldChange[] {
  return microdiff(left, right, {cyclesFix: false}).map((change) => {
    const path = change.path.join('.')
    if (change.type === 'CREATE') return {kind: 'added', path, to: change.value}
    if (change.type === 'REMOVE') return {from: change.oldValue, kind: 'removed', path}
    return {from: change.oldValue, kind: 'changed', path, to: change.value}
  })
}

function renderFieldChanges(changes: FieldChange[]): string {
  return changes
    .map((change) => {
      if (change.kind === 'added') return `+ ${change.path}: ${formatValue(change.to)}`
      if (change.kind === 'removed') return `- ${change.path}: ${formatValue(change.from)}`
      return `~ ${change.path}: ${formatValue(change.from)} → ${formatValue(change.to)}`
    })
    .join('\n')
}

function changeFor(id: string, left: unknown, right: unknown, labels: {left: string; right: string}): StateChange {
  if (typeof left === 'string' && typeof right === 'string') {
    return {id, patch: renderTextChange(id, left, right, labels)}
  }

  if (isRecord(left) && isRecord(right)) {
    const fields = objectFieldChanges(left, right)
    return {fields, id, patch: renderFieldChanges(fields)}
  }

  // Type mismatch between the two sides (e.g. a field that was a string and is now an object).
  return {id, patch: `~ ${formatValue(left)} → ${formatValue(right)}`}
}

// `left` is the reference, `right` is the subject. For `lps diff` with no env-vs-env args
// that's remote (left) vs local (right), so `added` reads as "present locally, not on the
// site" and `removed` as "on the site, not locally".
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

    diff.changed.push(changeFor(id, leftValue, rightValue, labels))
  }

  diff.added.sort((a, b) => a.localeCompare(b))
  diff.removed.sort((a, b) => a.localeCompare(b))
  diff.changed.sort((a, b) => a.id.localeCompare(b.id))
  return diff
}

export function isEmptyDiff(diff: StateDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0
}
