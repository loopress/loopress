import {execFile} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {delimiter, join} from 'node:path'
import {x} from 'tinyexec'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {findOnPath, killTree, resolveLps, runLps} from '../../src/lib/run-lps.js'

vi.mock('tinyexec', () => ({x: vi.fn()}))
vi.mock('node:child_process', () => ({execFile: vi.fn()}))

const exec = vi.mocked(x)
const {file, pre} = resolveLps()!

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

describe('findOnPath', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-path-'))
    mkdirSync(join(dir, 'bin'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
    vi.restoreAllMocks()
  })

  it('returns the absolute path of the first match on PATH', () => {
    writeFileSync(join(dir, 'bin', 'lps'), '')

    expect(findOnPath('lps', {PATH: ['/nowhere', join(dir, 'bin')].join(delimiter)}, 'linux')).toBe(join(dir, 'bin', 'lps'))
  })

  it('ignores relative PATH entries, so the working directory can never supply its own lps', () => {
    writeFileSync(join(dir, 'lps'), '')
    vi.spyOn(process, 'cwd').mockReturnValue(dir)

    expect(findOnPath('lps', {PATH: ['.', 'bin'].join(delimiter)}, 'linux')).toBeUndefined()
  })

  it('on Windows, picks the PATHEXT shim over the extensionless sh script npm writes next to it', () => {
    writeFileSync(join(dir, 'bin', 'lps'), '')
    writeFileSync(join(dir, 'bin', 'lps.cmd'), '')

    expect(findOnPath('lps', {PATH: join(dir, 'bin'), PATHEXT: '.EXE;.cmd'}, 'win32')).toBe(join(dir, 'bin', 'lps.cmd'))
  })

  it('returns undefined when nothing matches', () => {
    expect(findOnPath('lps', {PATH: join(dir, 'bin')}, 'linux')).toBeUndefined()
  })
})

describe('killTree', () => {
  it('kills the child directly outside Windows', () => {
    const child = {kill: vi.fn(() => true), pid: 42}

    killTree(child, 'linux')

    expect(child.kill).toHaveBeenCalledOnce()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('on Windows, kills the whole tree with taskkill (cmd.exe alone would leave the CLI running)', () => {
    const child = {kill: vi.fn(() => true), pid: 42}

    killTree(child, 'win32')

    expect(child.kill).not.toHaveBeenCalled()
    expect(execFile).toHaveBeenCalledWith(expect.stringMatching(/taskkill\.exe$/), ['/pid', '42', '/T', '/F'], expect.any(Function))
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

  it('kills a child still running at the deadline and reports a TIMEOUT instead of a generic ExecError', async () => {
    let settle = (): void => {}
    const child = Object.assign(new Promise((resolve) => { settle = () => { resolve({exitCode: undefined, stderr: '', stdout: ''}); } }), {
      kill: vi.fn(() => {
        settle()
        return true
      }),
      pid: 42,
    })
    exec.mockReturnValueOnce(child as never)

    const result = await runLps(['composer', 'push'], {timeoutMs: 20})

    expect(child.kill).toHaveBeenCalledOnce()
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
