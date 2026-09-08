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

    expect(diff.changed[0].patch).not.toContain('No newline at end of file')
  })
})
