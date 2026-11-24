import {afterEach, describe, expect, it, vi} from 'vitest'

import {CLOUD_BUDGET_MS, cloudTimeoutMs, resetCloudBudget, withCloudBudget} from '../../src/lib/cloud-budget.js'

describe('cloud budget', () => {
  afterEach(() => {
    resetCloudBudget()
    vi.useRealTimers()
  })

  it('gives the first call the whole budget and the next ones what is left', async () => {
    vi.useFakeTimers()
    const seen: number[] = []
    await withCloudBudget(async (timeoutMs) => {
      seen.push(timeoutMs)
      vi.setSystemTime(Date.now() + 2500)
    })
    await withCloudBudget(async (timeoutMs) => {
      seen.push(timeoutMs)
    })

    expect(seen).toEqual([CLOUD_BUDGET_MS, 500])
  })

  it('skips the call once the budget is spent, and charges a call that failed', async () => {
    vi.useFakeTimers()
    await expect(
      withCloudBudget(async () => {
        vi.setSystemTime(Date.now() + CLOUD_BUDGET_MS)
        throw new Error('timeout')
      }),
    ).rejects.toThrow('timeout')

    const call = vi.fn()
    expect(await withCloudBudget(call)).toBeUndefined()
    expect(call).not.toHaveBeenCalled()
    expect(cloudTimeoutMs()).toBe(0)
  })
})
