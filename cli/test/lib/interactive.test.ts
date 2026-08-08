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

  it.each([
    {ci: '', expected: true, stdin: true, stdout: true, title: 'is true with a TTY on both ends and no CI variable'},
    {ci: '', expected: false, stdin: false, stdout: true, title: 'is false when stdin is not a TTY'},
    {ci: 'true', expected: false, stdin: true, stdout: true, title: 'is false on a CI runner even with a TTY'},
  ])('$title', ({ci, expected, stdin, stdout}) => {
    process.stdin.isTTY = stdin
    process.stdout.isTTY = stdout
    vi.stubEnv('CI', ci)

    expect(isInteractive()).toBe(expected)
  })
})
