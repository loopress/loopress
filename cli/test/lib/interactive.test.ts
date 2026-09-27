import {confirm} from '@inquirer/prompts'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {confirmUninstall, isInteractive} from '../../src/lib/interactive.js'

vi.mock('@inquirer/prompts', () => ({confirm: vi.fn()}))

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

describe('confirmUninstall', () => {
  const isOriginalStdinTty = process.stdin.isTTY
  const isOriginalStdoutTty = process.stdout.isTTY

  afterEach(() => {
    process.stdin.isTTY = isOriginalStdinTty
    process.stdout.isTTY = isOriginalStdoutTty
    vi.unstubAllEnvs()
    vi.mocked(confirm).mockReset()
  })

  function tty(value: boolean): void {
    process.stdin.isTTY = value
    process.stdout.isTTY = value
    vi.stubEnv('CI', '')
  }

  it('proceeds without asking with --yes', async () => {
    tty(true)

    await expect(confirmUninstall(['akismet'], true)).resolves.toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('proceeds without asking when there is nothing to uninstall', async () => {
    tty(true)

    await expect(confirmUninstall([], false)).resolves.toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('proceeds without asking outside a TTY', async () => {
    tty(false)

    await expect(confirmUninstall(['akismet'], false)).resolves.toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks in a TTY, naming every plugin, defaulting to no, and returns the answer', async () => {
    tty(true)
    vi.mocked(confirm).mockResolvedValueOnce(false)

    await expect(confirmUninstall(['akismet', 'hello'], false)).resolves.toBe(false)
    expect(confirm).toHaveBeenCalledWith({default: false, message: 'Uninstall akismet, hello from the site?'})
  })
})
