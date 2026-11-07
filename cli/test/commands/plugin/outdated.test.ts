import {beforeEach, describe, expect, it, vi} from 'vitest'

import Outdated from '../../../src/commands/plugin/outdated.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {versionJump} from '../../../src/utils/version.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

const {gotFn} = vi.hoisted(() => ({gotFn: vi.fn()}))

vi.mock('got', () => ({default: gotFn}))

// slug -> WordPress.org answer; a missing slug behaves like an unknown plugin.
function mockWporg(versions: Record<string, string>) {
  gotFn.mockImplementation((_url: string, opts: {searchParams: Record<string, string>}) => ({
    async json() {
      const version = versions[opts.searchParams['request[slug]'] ?? '']
      return version ? {version} : {error: 'Plugin not found.'}
    },
  }))
}

function make(config: LoopressLocalConfig) {
  const cmd = new Outdated([], fakeOclifConfig)
  ;(cmd as unknown as {localConfig: LoopressLocalConfig}).localConfig = config
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('plugin outdated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
  })

  it('reports nothing and makes no request without plugins', async () => {
    const {cmd} = make({})
    expect(await cmd.run()).toEqual({outdated: 0, plugins: []})
    expect(gotFn).not.toHaveBeenCalled()
  })

  it('is clean when every plugin is up to date', async () => {
    mockWporg({akismet: '5.3.3', woocommerce: '9.4.2'})
    const {cmd} = make({plugins: {akismet: '5.3.3', woocommerce: {active: false, version: 'latest'}}})
    const result = await cmd.run()
    expect(result.outdated).toBe(0)
    expect(result.plugins.map((p) => p.status)).toEqual(['current', 'current'])
  })

  it('classifies major, minor and patch jumps and exits 1', async () => {
    mockWporg({a: '2.0.0', b: '1.3.0', c: '1.0.5'})
    const {cmd} = make({plugins: {a: '1.9.9', b: '1.2.0', c: '1.0.1'}})
    const exit = vi.spyOn(cmd, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }))
    await expect(cmd.run()).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('returns the jumps and sets the exit code under --json', async () => {
    mockWporg({a: '2.0.0', b: '1.3.0', c: '1.0.5'})
    const {cmd} = make({plugins: {a: '1.9.9', b: '1.2.0', c: '1.0.1'}})
    vi.spyOn(cmd, 'jsonEnabled').mockReturnValue(true)
    const result = await cmd.run()
    expect(result.plugins.map((p) => p.jump)).toEqual(['major', 'minor', 'patch'])
    expect(result.outdated).toBe(3)
    expect(process.exitCode).toBe(1)
  })

  it('lists plugins missing from WordPress.org as unknown without failing', async () => {
    mockWporg({})
    const {cmd} = make({plugins: {'acf-pro': '6.0.0'}})
    const result = await cmd.run()
    expect(result.plugins).toEqual([{current: '6.0.0', jump: null, latest: null, slug: 'acf-pro', status: 'unknown'}])
    expect(result.outdated).toBe(0)
    expect(process.exitCode).toBeUndefined()
  })
})

describe('outdated with a closed plugin', () => {
  it('reports closed and exits 1', async () => {
    gotFn.mockImplementation(() => ({
      async json() {
        return {error: 'closed'}
      },
    }))
    const {cmd} = make({plugins: {gone: '1.0.0'}})
    vi.spyOn(cmd, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }))
    await expect(cmd.run()).rejects.toThrow('exit')
  })
})

describe('outdated when WordPress.org fails', () => {
  it('reports an error and exits 1', async () => {
    gotFn.mockImplementation(() => ({
      async json() {
        throw new Error('network down')
      },
    }))
    const {cmd} = make({plugins: {akismet: '5.0.0'}})
    vi.spyOn(cmd, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }))
    await expect(cmd.run()).rejects.toThrow('exit')
  })
})

describe('versionJump', () => {
  it('returns null when not behind', () => {
    expect(versionJump('2.0.0', '2.0.0')).toBeNull()
    expect(versionJump('3.0.0', '2.0.0')).toBeNull()
    expect(versionJump('latest', '2.0.0')).toBeNull()
  })
})
