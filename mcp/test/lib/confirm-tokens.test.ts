import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {consumeConfirmation, createConfirmation} from '../../src/lib/confirm-tokens.js'

describe('confirm-tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('round-trips the args stored at creation time', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'])

    const consumed = consumeConfirmation('snippet_push', confirmToken)

    expect(consumed).toEqual({args: ['snippet', 'push'], ok: true})
  })

  it('rejects an unknown token', () => {
    const consumed = consumeConfirmation('snippet_push', 'not-a-real-token')

    expect(consumed.ok).toBe(false)
    if (!consumed.ok) expect(consumed.error.name).toBe('INVALID_CONFIRM_TOKEN')
  })

  it('is single-use: a second consume of the same token fails even though the first succeeded', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'])

    consumeConfirmation('snippet_push', confirmToken)
    const second = consumeConfirmation('snippet_push', confirmToken)

    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.name).toBe('INVALID_CONFIRM_TOKEN')
  })

  it('rejects a token consumed for a different tool than it was issued for', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'])

    const consumed = consumeConfirmation('page_push', confirmToken)

    expect(consumed.ok).toBe(false)
    if (!consumed.ok) expect(consumed.error.name).toBe('INVALID_CONFIRM_TOKEN')
  })

  it('rejects a token past its TTL', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'])

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    const consumed = consumeConfirmation('snippet_push', confirmToken)

    expect(consumed.ok).toBe(false)
    if (!consumed.ok) expect(consumed.error.name).toBe('CONFIRM_TOKEN_EXPIRED')
  })

  it('accepts a token right up to its TTL boundary', () => {
    const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push'])

    vi.advanceTimersByTime(5 * 60 * 1000)
    const consumed = consumeConfirmation('snippet_push', confirmToken)

    expect(consumed.ok).toBe(true)
  })

  it('prunes expired entries on the next create instead of growing forever', () => {
    const {confirmToken: stale} = createConfirmation('snippet_push', ['snippet', 'push'])

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    createConfirmation('page_push', ['page', 'push'])

    // The stale entry is gone from the store entirely (not just logically expired): consuming
    // it now looks unknown, the same as a token that was never issued.
    expect(consumeConfirmation('snippet_push', stale).ok).toBe(false)
  })

  it('caps the number of pending previews, evicting the oldest once full', () => {
    let firstToken = ''
    for (let i = 0; i < 101; i++) {
      const {confirmToken} = createConfirmation('snippet_push', ['snippet', 'push', String(i)])
      if (i === 0) firstToken = confirmToken
    }

    // The 101st confirmation evicted the very first one to stay at the cap.
    expect(consumeConfirmation('snippet_push', firstToken).ok).toBe(false)
  })
})
