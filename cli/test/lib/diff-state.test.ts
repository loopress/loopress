import {describe, expect, it} from 'vitest'

import {compareStates, isEmptyDiff, type ResourceState} from '../../src/lib/diff-state.js'

const labels = {left: 'staging', right: 'local'}

function state(entries: Record<string, unknown>): ResourceState {
  return new Map(Object.entries(entries))
}

describe('compareStates', () => {
  it('reports no drift for equal states', () => {
    const diff = compareStates(state({a: {x: 1}}), state({a: {x: 1}}), labels)

    expect(isEmptyDiff(diff)).toBe(true)
    expect(diff).toEqual({added: [], changed: [], removed: []})
  })

  it('lists ids only in the right side as added, only in the left as removed', () => {
    const diff = compareStates(state({keep: 1, gone: 2}), state({keep: 1, fresh: 3}), labels)

    expect(diff.added).toEqual(['fresh'])
    expect(diff.removed).toEqual(['gone'])
    expect(diff.changed).toEqual([])
    expect(isEmptyDiff(diff)).toBe(false)
  })

  it('sorts added, removed and changed ids', () => {
    const diff = compareStates(state({b: 1, a: 1, m: 1, n: 2}), state({c: 1, a: 2, m: 3, z: 1}), labels)

    expect(diff.added).toEqual(['c', 'z'])
    expect(diff.removed).toEqual(['b', 'n'])
    expect(diff.changed.map((change) => change.id)).toEqual(['a', 'm'])
  })

  // Deliberately reverse-alphabetical map insertion order: unlike the fixture above (which
  // happens to already come out sorted even without a real sort), this one only passes if
  // added/removed/changed are genuinely sorted, not left in Map iteration order.
  it('actually sorts, rather than relying on a fixture that is already in order', () => {
    // Every one of left's/right's own key-insertion orders is reverse-alphabetical within its
    // added/removed/changed subset, so an unsorted result would fail these exact-order checks
    // (the coincidental fixture above happens to insert each subset in order already).
    const left = state({zebra_removed: 1, zebra_changed: 1, apple_removed: 1, apple_changed: 1})
    const right = state({zebra_changed: 2, apple_changed: 2, zebra_added: 1, apple_added: 1})

    const diff = compareStates(left, right, labels)

    expect(diff.added).toEqual(['apple_added', 'zebra_added'])
    expect(diff.removed).toEqual(['apple_removed', 'zebra_removed'])
    expect(diff.changed.map((change) => change.id)).toEqual(['apple_changed', 'zebra_changed'])
  })

  it('ignores key ordering inside nested objects', () => {
    const left = state({a: {one: 1, two: {x: 1, y: 2}}})
    const right = state({a: {two: {y: 2, x: 1}, one: 1}})

    expect(isEmptyDiff(compareStates(left, right, labels))).toBe(true)
  })

  it('treats array order as significant', () => {
    const diff = compareStates(state({a: {list: [1, 2]}}), state({a: {list: [2, 1]}}), labels)

    expect(diff.changed.map((change) => change.id)).toEqual(['a'])
  })

  it('renders an object change as a per-field list', () => {
    const diff = compareStates(
      state({snippet: {name: 'Hero', priority: 10, tags: ['a']}}),
      state({snippet: {location: 'footer', name: 'Hero', priority: 20}}),
      labels,
    )

    const lines = diff.changed[0].patch.split('\n')
    expect(lines).toContain('~ priority: 10 → 20')
    expect(lines).toContain('- tags: ["a"]')
    expect(lines).toContain('+ location: "footer"')
    expect(lines).not.toContain('~ name: "Hero" → "Hero"')
  })

  it('reports a deeply nested field change by its path', () => {
    const diff = compareStates(
      state({form: {settings: {notifications: {1: {email: 'a@x.com'}}}}}),
      state({form: {settings: {notifications: {1: {email: 'b@x.com'}}}}}),
      labels,
    )

    expect(diff.changed[0].patch).toBe('~ settings.notifications.1.email: "a@x.com" → "b@x.com"')
  })

  it('exposes object changes as a structured fields list, but not text changes', () => {
    const objectDiff = compareStates(
      state({snippet: {active: true, priority: 10, tags: ['a']}}),
      state({snippet: {active: true, name: 'X', priority: 20}}),
      labels,
    )
    expect(objectDiff.changed[0].fields).toEqual([
      {from: 10, kind: 'changed', path: 'priority', to: 20},
      {from: ['a'], kind: 'removed', path: 'tags'},
      {kind: 'added', path: 'name', to: 'X'},
    ])

    const textDiff = compareStates(state({'route.php': 'a\n'}), state({'route.php': 'b\n'}), labels)
    expect(textDiff.changed[0].fields).toBeUndefined()
  })

  it('truncates very long values in an object change', () => {
    const diff = compareStates(state({a: {blob: 'x'}}), state({a: {blob: 'y'.repeat(500)}}), labels)

    expect(diff.changed[0].patch).toMatch(/…$/)
    expect(diff.changed[0].patch.length).toBeLessThan(260)
  })

  it('diffs string values as text rather than escaped JSON, carrying both labels', () => {
    const diff = compareStates(
      state({'route.php': "<?php\ndeclare(strict_types=1);\nreturn 1;\n"}),
      state({'route.php': "<?php\ndeclare(strict_types=1);\nreturn 2;\n"}),
      labels,
    )

    const {patch} = diff.changed[0]
    expect(patch).toContain('staging')
    expect(patch).toContain('local')
    expect(patch).toContain('-return 1;')
    expect(patch).toContain('+return 2;')
    expect(patch).not.toContain(String.raw`\n`)
  })

  it('keeps the patch free of "no newline at end of file" markers when neither side ends in one', () => {
    const diff = compareStates(state({a: 'line one\nline two'}), state({a: 'line one\nline changed'}), labels)

    // Not just the absence of the marker: the appended-newline fallback must keep the text
    // itself, not discard it (a real regression one of the ways to break this makes).
    expect(diff.changed[0].patch).toContain('-line two')
    expect(diff.changed[0].patch).toContain('+line changed')
    expect(diff.changed[0].patch).not.toContain('No newline at end of file')
  })

  it('renders a clean single-line text patch: no "Index:"/"===" preamble, no doubled trailing newline', () => {
    const diff = compareStates(state({a: 'x\n'}), state({a: 'y\n'}), labels)

    // An exact match, not a substring check: this is the only way to prove the "Index:"/"==="
    // preamble was stripped AND that ensureTrailingNewline() didn't add a spurious second
    // newline to text that already ended with one.
    expect(diff.changed[0].patch).toBe('--- a\tstaging\n+++ a\tlocal\n@@ -1,1 +1,1 @@\n-x\n+y')
  })

  it('truncates a long object-field value one character past the limit, not exactly at it', () => {
    const at200 = compareStates(state({a: {blob: 'x'}}), state({a: {blob: 'a'.repeat(198)}}), labels) // JSON-stringified length: 200
    expect(at200.changed[0].patch).not.toMatch(/…/)

    const raw = 'a'.repeat(199) // JSON-stringified length: 201, one past the limit
    const at201 = compareStates(state({a: {blob: 'x'}}), state({a: {blob: raw}}), labels)
    const expectedTruncated = `${JSON.stringify(raw).slice(0, 199)}…` // exactly MAX_VALUE_LENGTH - 1 kept characters
    expect(at201.changed[0].patch).toBe(`~ blob: "x" → ${expectedTruncated}`)
  })

  it('treats null as a type mismatch, not an object to structurally diff', () => {
    const diff = compareStates(state({a: null}), state({a: {x: 1}}), labels)

    expect(diff.changed[0].fields).toBeUndefined()
    expect(diff.changed[0].patch).toBe('~ null → {"x":1}')
  })

  it('treats a value that changed type from string to object as a mismatch, not a text diff', () => {
    const diff = compareStates(state({a: 'plain text'}), state({a: {x: 1}}), labels)

    expect(diff.changed[0].fields).toBeUndefined()
    expect(diff.changed[0].patch).toBe('~ "plain text" → {"x":1}')
  })

  it('treats a value that changed type from object to string as a mismatch too (not just the reverse)', () => {
    const diff = compareStates(state({a: {x: 1}}), state({a: 'plain text'}), labels)

    expect(diff.changed[0].fields).toBeUndefined()
    expect(diff.changed[0].patch).toBe('~ {"x":1} → "plain text"')
  })

  it('isEmptyDiff treats removed-only drift as non-empty too (not just added/changed)', () => {
    const diff = compareStates(state({gone: 1}), state({}), labels)

    expect(diff.added).toEqual([])
    expect(diff.changed).toEqual([])
    expect(diff.removed).toEqual(['gone'])
    expect(isEmptyDiff(diff)).toBe(false)
  })
})
