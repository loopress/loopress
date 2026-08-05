import {execFile} from 'node:child_process'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {runLps} from '../../src/lib/run-lps.js'

const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom')

// `runLps` calls `promisify(execFile)`; Node's own child_process module defines a custom
// promisify implementation for execFile (resolving `{stdout, stderr}`, and attaching stdout to
// a rejection when the child exits non-zero). Mocking that custom-promisify slot, rather than
// the callback-style export, is what lets the mock behave like the real thing.
vi.mock('node:child_process', () => ({
  execFile: Object.assign(vi.fn(), {[Symbol.for('nodejs.util.promisify.custom')]: vi.fn()}),
}))

const execFileCustom = (execFile as unknown as Record<symbol, ReturnType<typeof vi.fn>>)[PROMISIFY_CUSTOM]

describe('runLps', () => {
  beforeEach(() => {
    execFileCustom.mockReset()
  })

  it('parses stdout as JSON and appends --json to the argv', async () => {
    execFileCustom.mockResolvedValueOnce({stderr: '', stdout: '{"status":"success"}'})

    const result = await runLps(['snippet', 'push'])

    expect(result).toEqual({data: {status: 'success'}, ok: true})
    expect(execFileCustom).toHaveBeenCalledWith('lps', ['snippet', 'push', '--json'], expect.objectContaining({cwd: process.cwd()}))
  })

  it("reads oclif's structured error envelope off the rejection's stdout", async () => {
    const error = Object.assign(new Error('Command failed'), {
      stdout: '{"error":{"message":"No composer.json found","name":"Error"}}',
    })
    execFileCustom.mockRejectedValueOnce(error)

    const result = await runLps(['composer', 'push'])

    expect(result).toEqual({error: {message: 'No composer.json found', name: 'Error'}, ok: false})
  })

  it('falls back to a generic error when the child never got as far as printing JSON (e.g. lps not found)', async () => {
    execFileCustom.mockRejectedValueOnce(new Error('spawn lps ENOENT'))

    const result = await runLps(['snippet', 'list'])

    expect(result).toEqual({error: {message: 'spawn lps ENOENT', name: 'ExecError'}, ok: false})
  })

  it('falls back to a generic error when stdout on the rejection is not valid JSON', async () => {
    const error = Object.assign(new Error('Command failed'), {stdout: 'not json'})
    execFileCustom.mockRejectedValueOnce(error)

    const result = await runLps(['snippet', 'list'])

    expect(result).toEqual({error: {message: 'Command failed', name: 'ExecError'}, ok: false})
  })
})
