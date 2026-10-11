import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {withoutSpinner, withSpinner} from '../../src/lib/spinner.js'

describe('withSpinner', () => {
  const originalIsTTY = process.stderr.isTTY
  const originalCI = process.env.CI
  let stderrWrite: ReturnType<typeof vi.fn>

  beforeEach(() => {
    stderrWrite = vi.fn(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(stderrWrite)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    process.stderr.isTTY = true
    delete process.env.CI
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.stderr.isTTY = originalIsTTY
    process.env.CI = originalCI
  })

  const drawn = () => stderrWrite.mock.calls.map(([chunk]) => String(chunk)).join('')

  it('draws the label on stderr while pending, then clears it and restores both streams', async () => {
    const stdoutWrite = process.stdout.write
    const stderrWriteBefore = process.stderr.write

    const result = await withSpinner('Waiting for example.com', async () => {
      expect(process.stderr.write).not.toBe(stderrWriteBefore)
      return 42
    })

    expect(result).toBe(42)
    expect(drawn()).toContain('Waiting for example.com')
    expect(drawn().endsWith('\r\u{1B}[2K')).toBe(true)
    expect(process.stdout.write).toBe(stdoutWrite)
    expect(process.stderr.write).toBe(stderrWriteBefore)
  })

  it('stops even when the work throws', async () => {
    const stderrWriteBefore = process.stderr.write
    await expect(
      withSpinner('x', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(process.stderr.write).toBe(stderrWriteBefore)
  })

  it('shares one spinner across overlapping waits, keeping the outer label', async () => {
    await withSpinner('outer', async () => {
      await Promise.all([withSpinner('inner', async () => {}), withSpinner('inner', async () => {})])
    })

    expect(drawn()).not.toContain('inner')
  })

  it('draws nothing outside a TTY or in CI, so --json and pipes stay clean', async () => {
    process.stderr.isTTY = false
    await withSpinner('x', async () => {})
    process.stderr.isTTY = true
    process.env.CI = 'true'
    await withSpinner('x', async () => {})

    expect(stderrWrite).not.toHaveBeenCalled()
  })

  async function listrLike(): Promise<void> {
    stderrWrite.mockClear()
    await withSpinner('inside listr', async () => {})
    expect(stderrWrite).not.toHaveBeenCalled()
  }

  it('steps aside for withoutSpinner (Listr) and comes back while a wait is still pending', async () => {
    await withSpinner('outer', async () => {
      await withoutSpinner(listrLike)
      expect(drawn()).toContain('outer')
    })
  })
})
