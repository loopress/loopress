import {afterEach, describe, expect, it, vi} from 'vitest'

import {stdoutToStderr} from '../../src/lib/json-delegation.js'

describe('stdoutToStderr', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends what the delegated work prints on stdout to stderr, then restores stdout', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const originalWrite = process.stdout.write

    const result = await stdoutToStderr(true, async () => {
      process.stdout.write('Pushing snippets to https://example.test\n')
      return 42
    })

    expect(result).toBe(42)
    expect(stderr).toHaveBeenCalledWith('Pushing snippets to https://example.test\n')
    expect(process.stdout.write).toBe(originalWrite)
  })

  it('restores stdout even when the work throws', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const originalWrite = process.stdout.write

    await expect(stdoutToStderr(true, async () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')

    expect(process.stdout.write).toBe(originalWrite)
  })

  it('leaves stdout alone when not in JSON mode', async () => {
    const originalWrite = process.stdout.write
    await stdoutToStderr(false, async () => {
      expect(process.stdout.write).toBe(originalWrite)
    })
  })
})
