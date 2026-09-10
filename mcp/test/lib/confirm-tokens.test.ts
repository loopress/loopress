import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {consumeConfirmation, createConfirmation} from '../../src/lib/confirm-tokens.js'
import {removeSnapshot} from '../../src/lib/snapshot.js'

vi.mock('../../src/lib/snapshot.js', () => ({createSnapshot: vi.fn(), removeSnapshot: vi.fn()}))

const mockedRemoveSnapshot = vi.mocked(removeSnapshot)
const SNAP = '/tmp/loopress-mcp-test-snapshot'

describe('confirm-tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockedRemoveSnapshot.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('round-trips the args and snapshot dir stored at creation time', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'], SNAP)

    const consumed = consumeConfirmation('snippet_push', confirmToken)

    expect(consumed).toEqual({args: ['snippet', 'push'], ok: true, snapshotDir: SNAP})
  })

  it('rejects an unknown token', () => {
    const consumed = consumeConfirmation('snippet_push', 'not-a-real-token')

    expect(consumed.ok).toBe(false)
    if (!consumed.ok) expect(consumed.error.name).toBe('INVALID_CONFIRM_TOKEN')
  })

  it('is single-use: a second consume of the same token fails even though the first succeeded', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'], SNAP)

    consumeConfirmation('snippet_push', confirmToken)
    const second = consumeConfirmation('snippet_push', confirmToken)

    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.name).toBe('INVALID_CONFIRM_TOKEN')
  })

  it('rejects a token consumed for a different tool than it was issued for, and drops its snapshot', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'], SNAP)

    const consumed = consumeConfirmation('form_push', confirmToken)

    expect(consumed.ok).toBe(false)
    if (!consumed.ok) expect(consumed.error.name).toBe('INVALID_CONFIRM_TOKEN')
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
  })

  it('rejects a token past its TTL and drops its snapshot', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'], SNAP)

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    const consumed = consumeConfirmation('snippet_push', confirmToken)

    expect(consumed.ok).toBe(false)
    if (!consumed.ok) expect(consumed.error.name).toBe('CONFIRM_TOKEN_EXPIRED')
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
  })

  it('accepts a token right up to its TTL boundary', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'], SNAP)

    vi.advanceTimersByTime(5 * 60 * 1000)
    const consumed = consumeConfirmation('snippet_push', confirmToken)

    expect(consumed.ok).toBe(true)
  })

  it('prunes expired entries on the next create, dropping their snapshots', () => {
    const {confirmToken: stale} = createConfirmation('snippet_push', ['snippet', 'push'], '/tmp/stale-snap')

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    createConfirmation('form_push', ['form', 'push'], SNAP)

    expect(mockedRemoveSnapshot).toHaveBeenCalledWith('/tmp/stale-snap')
    // The stale entry is gone from the store entirely: consuming it now looks unknown.
    expect(consumeConfirmation('snippet_push', stale).ok).toBe(false)
  })

  it('caps the number of pending previews, evicting the oldest and its snapshot once full', () => {
    let firstToken = ''
    for (let i = 0; i < 101; i++) {
      const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push', String(i)], `/tmp/snap-${i}`)
      if (i === 0) firstToken = confirmToken
    }

    expect(consumeConfirmation('snippet_push', firstToken).ok).toBe(false)
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith('/tmp/snap-0')
  })
})
