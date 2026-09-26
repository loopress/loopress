import {x} from 'tinyexec'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {resolveLps, runLps} from '../../src/lib/run-lps.js'

vi.mock('tinyexec', () => ({x: vi.fn()}))

const exec = vi.mocked(x)
const {file, pre} = resolveLps()

function exits(exitCode: number, stdout: string, stderr = ''): void {
  exec.mockResolvedValueOnce({exitCode, stderr, stdout} as never)
}

describe('resolveLps', () => {
  it('runs a .js LPS_BIN under the current Node, so Windows never has to spawn a .cmd shim', () => {
    expect(resolveLps('/x/cli/bin/dev.js')).toEqual({file: process.execPath, pre: ['/x/cli/bin/dev.js']})
  })

  it('spawns any other LPS_BIN as is', () => {
    expect(resolveLps('/usr/local/bin/lps')).toEqual({file: '/usr/local/bin/lps', pre: []})
  })

  it("defaults to the installed CLI's bin/run.js under Node, resolved next to this package", () => {
    expect(resolveLps('')).toEqual({file: process.execPath, pre: [expect.stringMatching(/cli[\\/]bin[\\/]run\.js$/)]})
  })
})

describe('runLps', () => {
  beforeEach(() => {
    exec.mockReset()
  })

  it('parses stdout as JSON and appends --json to the argv', async () => {
    exits(0, '{"status":"success"}')

    const result = await runLps(['snippet', 'push'])

    expect(result).toEqual({data: {status: 'success'}, ok: true})
    expect(exec).toHaveBeenCalledWith(file, [...pre, 'snippet', 'push', '--json'], expect.objectContaining({nodeOptions: {cwd: process.cwd()}}))
  })

  it('runs from the requested cwd (the mutating handshake points it at a frozen snapshot)', async () => {
    exits(0, '{}')

    await runLps(['snippet', 'push'], {cwd: '/snapshot'})

    expect(exec).toHaveBeenCalledWith(file, expect.any(Array), expect.objectContaining({nodeOptions: {cwd: '/snapshot'}}))
  })

  it('reports a child still running at the deadline as a TIMEOUT error instead of a generic ExecError', async () => {
    exec.mockImplementationOnce(
      (_file, _args, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () => { reject(new Error('The operation was aborted')); })
        }) as never,
    )

    const result = await runLps(['composer', 'push'], {timeoutMs: 20})

    expect(result).toEqual({error: {message: 'lps composer push timed out after 0.02s.', name: 'TIMEOUT'}, ok: false})
  })

  it("reads oclif's structured error envelope off stdout when the child exits non-zero", async () => {
    exits(2, '{"error":{"message":"No composer.json found","name":"Error"}}')

    const result = await runLps(['composer', 'push'])

    expect(result).toEqual({error: {message: 'No composer.json found', name: 'Error'}, ok: false})
  })

  it('returns the payload of a non-zero exit that is not an error envelope (e.g. diff exiting 1 on drift)', async () => {
    exits(1, '{"drift":true,"resources":{}}')

    const result = await runLps(['page', 'diff'])

    expect(result).toEqual({data: {drift: true, resources: {}}, ok: true})
  })

  it('reports a child that could not start at all (e.g. lps not found) as a generic error', async () => {
    exec.mockRejectedValueOnce(new Error('spawn lps ENOENT'))

    const result = await runLps(['snippet', 'list'])

    expect(result).toEqual({error: {message: 'spawn lps ENOENT', name: 'ExecError'}, ok: false})
  })

  it('surfaces stderr when stdout is not JSON (the process crashed before oclif handled the error)', async () => {
    exits(1, 'not json', 'TypeError: boom\n')

    const result = await runLps(['snippet', 'list'])

    expect(result).toEqual({error: {message: 'TypeError: boom', name: 'ExecError'}, ok: false})
  })

  it('falls back to the exit code when a non-JSON failure printed nothing on stderr either', async () => {
    exits(1, '')

    const result = await runLps(['snippet', 'list'])

    expect(result).toEqual({error: {message: 'lps snippet list exited with code 1 without JSON output.', name: 'ExecError'}, ok: false})
  })
})
