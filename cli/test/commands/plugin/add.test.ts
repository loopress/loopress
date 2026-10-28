import {mkdtempSync, rmSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Add from '../../../src/commands/plugin/add.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

// WordPress.org plugin info, keyed by slug: `requires_plugins` drives the dependency lookup.
const {gotFn, wporg} = vi.hoisted(() => ({gotFn: vi.fn(), wporg: new Map<string, string[]>()}))
vi.mock('got', () => ({default: gotFn}))

type AddInternals = {
  dryRun: boolean
  localConfig: LoopressLocalConfig
}

function make(argv: string[], localConfig: LoopressLocalConfig = {}, dryRun = false) {
  const cmd = new Add(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const internals = cmd as unknown as AddInternals
  internals.localConfig = localConfig
  internals.dryRun = dryRun
  return {cmd, logs}
}

describe('plugin add', () => {
  let tmpDir: string

  beforeEach(() => {
    wporg.clear()
    gotFn.mockImplementation((_url: string, opts: {searchParams: Record<string, string>}) => ({
      json: async () => ({requires_plugins: wporg.get(opts.searchParams['request[slug]'] ?? '') ?? []}),
    }))
    tmpDir = mkdtempSync(join(tmpdir(), 'lps-plugin-add-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, {force: true, recursive: true})
  })

  it('adds a new plugin pinned to "latest" by default', async () => {
    const {cmd, logs} = make(['woocommerce'])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Added woocommerce (latest). Run `lps plugin push` to apply.')
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({woocommerce: 'latest'})
  })

  it('returns a structured result for --json and the MCP plugin_add tool', async () => {
    expect(await make(['woocommerce']).cmd.run()).toEqual({
      dependencies: [],
      slug: 'woocommerce',
      status: 'added',
      version: 'latest',
    })
    expect(await make(['woocommerce'], {plugins: {woocommerce: 'latest'}}).cmd.run()).toEqual({
      dependencies: [],
      slug: 'woocommerce',
      status: 'unchanged',
      version: 'latest',
    })
    expect(await make(['woocommerce', '--version', '9.4.2'], {plugins: {woocommerce: 'latest'}}).cmd.run()).toEqual({
      dependencies: [],
      slug: 'woocommerce',
      status: 'updated',
      version: '9.4.2',
    })
    expect(await make(['akismet'], {}, true).cmd.run()).toEqual({
      dependencies: [],
      slug: 'akismet',
      status: 'dry-run',
      version: 'latest',
    })
  })

  it('adds the plugins it requires, transitively, as "latest" and keeps existing pins', async () => {
    wporg.set('dokan-pro-addon', ['dokan-lite'])
    wporg.set('dokan-lite', ['woocommerce'])
    const {cmd, logs} = make(['dokan-pro-addon'], {plugins: {acf: '6.3.0'}})

    expect(await cmd.run()).toEqual({
      dependencies: ['dokan-lite', 'woocommerce'],
      slug: 'dokan-pro-addon',
      status: 'added',
      version: 'latest',
    })
    expect(logs.log).toHaveBeenCalledWith(
      'Added dokan-pro-addon (latest), with required dokan-lite, woocommerce (latest). Run `lps plugin push` to apply.',
    )
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({
      acf: '6.3.0',
      'dokan-lite': 'latest',
      'dokan-pro-addon': 'latest',
      woocommerce: 'latest',
    })
  })

  it('leaves an already pinned dependency alone, and adds a missing one to an unchanged plugin', async () => {
    wporg.set('dokan-lite', ['woocommerce'])
    expect(
      (await make(['dokan-lite'], {plugins: {'dokan-lite': 'latest', woocommerce: '9.4.2'}}).cmd.run()).status,
    ).toBe('unchanged')

    await make(['dokan-lite'], {plugins: {'dokan-lite': 'latest'}}).cmd.run()
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({'dokan-lite': 'latest', woocommerce: 'latest'})
  })

  it('warns when a dependency is pinned inactive', async () => {
    wporg.set('dokan-lite', ['woocommerce'])
    const {cmd, logs} = make(['dokan-lite'], {plugins: {woocommerce: {active: false, version: '9.4.2'}}})

    await cmd.run()

    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('requires woocommerce, pinned inactive'))
  })

  it('adds the plugin alone when WordPress.org is unreachable', async () => {
    gotFn.mockImplementation(() => ({
      async json() {
        throw new Error('ENOTFOUND')
      },
    }))

    expect((await make(['dokan-lite']).cmd.run()).dependencies).toEqual([])
  })

  it('pins an exact version with --version', async () => {
    const {cmd} = make(['woocommerce', '--version', '9.4.2'])

    await cmd.run()

    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({woocommerce: '9.4.2'})
  })

  it('rejects a Composer constraint passed to --version', async () => {
    const {cmd} = make(['woocommerce', '--version', '^9.4'])

    await expect(cmd.run()).rejects.toThrow(/exact version/)
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })

  it('preserves existing plugins when adding a new one', async () => {
    const {cmd} = make(['woocommerce'], {plugins: {acf: '6.3.0'}})

    await cmd.run()

    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({acf: '6.3.0', woocommerce: 'latest'})
  })

  it('updates the pinned version of a plugin already present', async () => {
    const {cmd, logs} = make(['woocommerce', '--version', '9.5.0'], {plugins: {woocommerce: '9.4.2'}})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Updated woocommerce (9.5.0). Run `lps plugin push` to apply.')
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins.woocommerce).toBe('9.5.0')
  })

  it('is a no-op when the plugin is already pinned to the same value', async () => {
    const {cmd, logs} = make(['woocommerce'], {plugins: {woocommerce: 'latest'}})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('woocommerce is already pinned to latest in loopress.json, nothing to do.')
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })

  it('does not write the file on a dry run', async () => {
    const {cmd, logs} = make(['woocommerce'], {}, true)

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would add woocommerce (latest) in loopress.json')
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })
})
