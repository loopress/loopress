import {afterEach, describe, expect, it, vi} from 'vitest'

import {isInteractive} from '../../src/lib/interactive.js'

describe('isInteractive', () => {
  const originalStdinTty = process.stdin.isTTY
  const originalStdoutTty = process.stdout.isTTY

  afterEach(() => {
    process.stdin.isTTY = originalStdinTty
    process.stdout.isTTY = originalStdoutTty
    vi.unstubAllEnvs()
  })

  it('is true with a TTY on both ends and no CI variable', () => {
    process.stdin.isTTY = true
    process.stdout.isTTY = true
    vi.stubEnv('CI', '')

    expect(isInteractive()).toBe(true)
  })

  it('is false when stdin is not a TTY', () => {
    process.stdin.isTTY = false as never
    process.stdout.isTTY = true
    vi.stubEnv('CI', '')

    expect(isInteractive()).toBe(false)
  })

  it('is false on a CI runner even with a TTY', () => {
    process.stdin.isTTY = true
    process.stdout.isTTY = true
    vi.stubEnv('CI', 'true')

    expect(isInteractive()).toBe(false)
  })
})
