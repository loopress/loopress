import {beforeEach, describe, expect, it, vi} from 'vitest'

import Update, {pickUpdate} from '../../../src/commands/plugin/update.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

const {gotFn, writeLocalConfig} = vi.hoisted(() => ({gotFn: vi.fn(), writeLocalConfig: vi.fn()}))

vi.mock('got', () => ({default: gotFn}))
vi.mock('../../../src/utils/loopress-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  writeLocalConfig,
}))

// slug -> [latest, ...older releases]; a missing slug behaves like a plugin not on WordPress.org.
function mockWporg(releases: Record<string, string[]>) {
  gotFn.mockImplementation((_url: string, opts: {searchParams: Record<string, string>}) => ({
    async json() {
      const list = releases[opts.searchParams['request[slug]'] ?? '']
      if (!list) return {error: 'Plugin not found.'}
      const versions = opts.searchParams['request[fields][versions]']
        ? Object.fromEntries([...list, 'trunk'].map((v) => [v, `https://downloads.wordpress.org/${v}.zip`]))
        : undefined
      return {version: list[0], versions}
    },
  }))
}

function make(config: LoopressLocalConfig, argv: string[] = []) {
  const cmd = new Update(argv, fakeOclifConfig)
  ;(cmd as unknown as {localConfig: LoopressLocalConfig}).localConfig = config
  // init() is not run here: it is what sets dryRun from the flag.
  ;(cmd as unknown as {dryRun: boolean}).dryRun = argv.includes('--dry-run')
  silenceLogs(cmd)
  return cmd
}

describe('plugin update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
  })

  it('rewrites every outdated pin to the latest release and keeps object pins', async () => {
    mockWporg({akismet: ['5.3.3'], woocommerce: ['10.1.0', '9.5.1', '9.4.3']})
    const cmd = make({plugins: {akismet: '5.3.3', hello: 'latest', woocommerce: {active: false, version: '9.4.2'}}})
    const result = await cmd.run()
    expect(result.changes).toEqual([{from: '9.4.2', jump: 'major', slug: 'woocommerce', to: '10.1.0'}])
    expect(result.skipped.map((s) => [s.slug, s.reason])).toEqual([
      ['akismet', 'current'],
      ['hello', 'latest'],
    ])
    expect(writeLocalConfig).toHaveBeenCalledWith({
      plugins: {akismet: '5.3.3', hello: 'latest', woocommerce: {active: false, version: '10.1.0'}},
    })
  })

  it('caps the jump with --patch and --minor', async () => {
    mockWporg({woocommerce: ['10.1.0', '9.5.1', '9.5.0', '9.4.5', '9.4.4-beta.1', '9.4.3']})
    const patch = await make({plugins: {woocommerce: '9.4.2'}}, ['--patch']).run()
    expect(patch.changes).toEqual([{from: '9.4.2', jump: 'patch', slug: 'woocommerce', to: '9.4.5'}])
    const minor = await make({plugins: {woocommerce: '9.4.2'}}, ['--minor']).run()
    expect(minor.changes).toEqual([{from: '9.4.2', jump: 'minor', slug: 'woocommerce', to: '9.5.1'}])
  })

  it('leaves wildcard constraints alone', async () => {
    mockWporg({woocommerce: ['9.5.0']})
    const result = await make({plugins: {woocommerce: '9.4.x'}}).run()
    expect(result.changes).toEqual([])
    expect(result.skipped.map((s) => s.reason)).toEqual(['unknown'])
    expect(writeLocalConfig).not.toHaveBeenCalled()
  })

  it('reports unknown when a cap has no version list to work with', async () => {
    mockWporg({woocommerce: []})
    const result = await make({plugins: {woocommerce: '9.4.2'}}, ['--patch']).run()
    expect(result.changes).toEqual([])
    expect(result.skipped.map((s) => s.reason)).toEqual(['unknown'])
  })

  it('only updates the named slugs', async () => {
    mockWporg({akismet: ['5.3.4'], woocommerce: ['9.5.1']})
    const result = await make({plugins: {akismet: '5.3.3', woocommerce: '9.4.2'}}, ['akismet']).run()
    expect(result.changes.map((c) => c.slug)).toEqual(['akismet'])
    expect(writeLocalConfig).toHaveBeenCalledWith({plugins: {akismet: '5.3.4', woocommerce: '9.4.2'}})
  })

  it('refuses a slug missing from loopress.json', async () => {
    const cmd = make({plugins: {akismet: '5.3.3'}}, ['nope'])
    await expect(cmd.run()).rejects.toThrow(/Not in loopress.json: nope/)
    expect(gotFn).not.toHaveBeenCalled()
  })

  it('writes nothing under --dry-run or when everything is current', async () => {
    mockWporg({akismet: ['5.3.4']})
    expect((await make({plugins: {akismet: '5.3.3'}}, ['--dry-run']).run()).changes).toHaveLength(1)
    expect((await make({plugins: {akismet: '5.3.4'}}).run()).changes).toHaveLength(0)
    expect(writeLocalConfig).not.toHaveBeenCalled()
  })

  it('skips plugins not on WordPress.org as unknown', async () => {
    mockWporg({})
    const result = await make({plugins: {'acf-pro': '6.0.0'}}).run()
    expect(result.skipped).toEqual([{reason: 'unknown', slug: 'acf-pro', version: '6.0.0'}])
    expect(process.exitCode).toBeUndefined()
  })

  it('reports an unreachable WordPress.org and sets the exit code under --json', async () => {
    gotFn.mockImplementation(() => ({
      async json() {
        throw new Error('network down')
      },
    }))
    const cmd = make({plugins: {akismet: '5.0.0'}})
    vi.spyOn(cmd, 'jsonEnabled').mockReturnValue(true)
    const result = await cmd.run()
    expect(result.skipped).toEqual([{reason: 'error', slug: 'akismet', version: '5.0.0'}])
    expect(process.exitCode).toBe(1)
  })
})

describe('pickUpdate', () => {
  it('never moves to a prerelease or past the latest release under a cap', () => {
    expect(pickUpdate('1.0.0', '1.0.2', {'1.0.1': '', '1.0.3': '', '1.0.4-rc1': ''}, 'patch')).toBe('1.0.2')
  })

  it('returns null when nothing newer fits the cap', () => {
    expect(pickUpdate('1.0.0', '2.0.0', {'2.0.0': ''}, 'minor')).toBeNull()
    expect(pickUpdate('1.0.0', '1.0.0', undefined, undefined)).toBeNull()
  })
})
