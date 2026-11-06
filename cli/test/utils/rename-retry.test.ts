import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renameWithRetry} from '../../src/utils/rename-retry.js'

const rename = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', () => ({rename}))

const fail = (code: string) => Object.assign(new Error(code), {code})

describe('renameWithRetry', () => {
  beforeEach(() => { rename.mockReset() })

  it('retries on EPERM and EBUSY then succeeds', async () => {
    rename.mockRejectedValueOnce(fail('EPERM')).mockRejectedValueOnce(fail('EBUSY')).mockResolvedValueOnce(undefined)
    await renameWithRetry('a', 'b', 5, 1)
    expect(rename).toHaveBeenCalledTimes(3)
  })

  it('gives up after the allowed attempts', async () => {
    rename.mockRejectedValue(fail('EPERM'))
    await expect(renameWithRetry('a', 'b', 3, 1)).rejects.toThrow('EPERM')
    expect(rename).toHaveBeenCalledTimes(3)
  })

  it('does not retry other errors', async () => {
    rename.mockRejectedValue(fail('ENOENT'))
    await expect(renameWithRetry('a', 'b', 5, 1)).rejects.toThrow('ENOENT')
    expect(rename).toHaveBeenCalledTimes(1)
  })
})
