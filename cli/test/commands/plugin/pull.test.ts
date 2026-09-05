import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/plugin/pull.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type WpNativePlugin} from '../../../src/types/plugin.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type PullInternals = {
  dryRun: boolean
  localConfig: LoopressLocalConfig
  siteConfig: EnvironmentConfig
  wpClient: {get: ReturnType<typeof vi.fn>}
}

function nativePlugin(overrides: Partial<WpNativePlugin> & {plugin: string}): WpNativePlugin {
  return {name: overrides.plugin, plugin_uri: '', status: 'active', version: '1.0.0', ...overrides}
}

describe('plugin pull', () => {
  let dir: string

  function make(dryRun: boolean, localConfig: LoopressLocalConfig = {}) {
    const cmd = new Pull([], fakeOclifConfig)
    const internals = cmd as unknown as PullInternals
    internals.dryRun = dryRun
    internals.localConfig = localConfig
    internals.siteConfig = makeEnv('production', 'https://acme.com')
    const logs = silenceLogs(cmd)
    const get = vi.fn()
    internals.wpClient = {get}
    return {cmd, get, internals, logs}
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-plugin-pull-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('pins every installed plugin to the version running on the site', async () => {
    const {cmd, get, logs} = make(false)
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php', version: '5.3.3'})])

    await cmd.run()

    expect(get).toHaveBeenCalledWith('wp/v2/plugins')
    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({akismet: '5.3.3'})
    expect(logs.log).toHaveBeenCalledWith('Wrote 1 plugins to loopress.json')
  })

  it('never manages itself under any of its historical slugs', async () => {
    const {cmd, get} = make(false)
    get.mockResolvedValue([
      nativePlugin({plugin: 'loopress/loopress.php'}),
      nativePlugin({plugin: 'loopress-full/loopress-full.php'}),
      nativePlugin({plugin: 'akismet/akismet.php', version: '5.3.3'}),
    ])

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({akismet: '5.3.3'})
  })

  it('bails out and warns when the project uses a composer.json', async () => {
    writeFileSync(join(dir, 'composer.json'), '{}')
    const {cmd, get, logs} = make(false)

    const result = await cmd.run()

    expect(get).not.toHaveBeenCalled()
    expect(result.status).toBe('composer-managed')
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('lps composer pull'))
    expect(existsSync(join(dir, 'loopress.json'))).toBe(false)
  })

  it('merges with the existing manifest, preserving plugins no longer reported by the site', async () => {
    const {cmd, get} = make(false, {plugins: {'gravity-forms': '2.8.0'}})
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php', version: '5.3.3'})])

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({akismet: '5.3.3', 'gravity-forms': '2.8.0'})
  })

  it('reports a version change under "~ Updated" on a real run', async () => {
    const {cmd, get, logs} = make(false, {plugins: {woocommerce: '9.4.2'}})
    get.mockResolvedValue([nativePlugin({plugin: 'woocommerce/woocommerce.php', version: '9.5.0'})])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  ~ Updated: woocommerce 9.4.2 → 9.5.0')
    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({woocommerce: '9.5.0'})
  })

  it('returns the added/merged/updated/status result shape on a real run', async () => {
    const {cmd, get} = make(false, {plugins: {woocommerce: '9.4.2'}})
    get.mockResolvedValue([
      nativePlugin({plugin: 'woocommerce/woocommerce.php', version: '9.4.2'}),
      nativePlugin({plugin: 'akismet/akismet.php', version: '5.3.3'}),
    ])

    const result = await cmd.run()

    expect(result).toEqual({
      added: ['akismet'],
      merged: {akismet: '5.3.3', woocommerce: '9.4.2'},
      status: 'success',
      updated: [],
    })
  })

  it('writes nothing to loopress.json on a dry run', async () => {
    const {cmd, get, logs} = make(true)
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php', version: '5.3.3'})])

    await cmd.run()

    expect(existsSync(join(dir, 'loopress.json'))).toBe(false)
    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would write 1 plugins to loopress.json')
  })
})
