import {afterEach, describe, expect, it, vi} from 'vitest'

import {isInteractive} from '../../src/lib/interactive.js'

describe('isInteractive', () => {
  const isOriginalStdinTty = process.stdin.isTTY
  const isOriginalStdoutTty = process.stdout.isTTY

  afterEach(() => {
    process.stdin.isTTY = isOriginalStdinTty
    process.stdout.isTTY = isOriginalStdoutTty
    vi.unstubAllEnvs()
  })

  it('is true with a TTY on both ends and no CI variable', () => {
    process.stdin.isTTY = true
    process.stdout.isTTY = true
    vi.stubEnv('CI', '')

    expect(isInteractive()).toBe(true)
  })

  it('is false when stdin is not a TTY', () => {
    process.stdin.isTTY = false
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
