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
  return {name: overrides.plugin, status: 'active', version: '1.0.0', ...overrides}
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

  it('fetches wp/v2/plugins and writes the installed plugins to loopress.json', async () => {
    const {cmd, get, logs} = make(false)
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php'})])

    await cmd.run()

    expect(get).toHaveBeenCalledWith('wp/v2/plugins')
    expect(logs.log).toHaveBeenCalledWith('Pulling plugins from https://acme.com')
    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({akismet: 'latest'})
    expect(logs.log).toHaveBeenCalledWith('Wrote 1 plugins to loopress.json')
  })

  it('never manages itself under any of its historical slugs', async () => {
    const {cmd, get} = make(false)
    get.mockResolvedValue([
      nativePlugin({plugin: 'loopress/loopress.php'}),
      nativePlugin({plugin: 'loopress-full/loopress-full.php'}),
      nativePlugin({plugin: 'loopress-light/loopress-light.php'}),
      nativePlugin({plugin: 'akismet/akismet.php'}),
    ])

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({akismet: 'latest'})
  })

  it('excludes Composer-managed plugins from loopress.json and warns which ones were skipped', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/woocommerce': '^3.0'}}))
    const {cmd, get, logs} = make(false)
    get.mockResolvedValue([nativePlugin({plugin: 'woocommerce/woocommerce.php'}), nativePlugin({plugin: 'akismet/akismet.php'})])

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({akismet: 'latest'})
    expect(logs.log).toHaveBeenCalledWith('Skipping 1 Composer-managed plugin: woocommerce')
  })

  it('pluralizes the Composer-managed skip message for more than one plugin', async () => {
    writeFileSync(
      join(dir, 'composer.json'),
      JSON.stringify({require: {'wpackagist-plugin/acf': '^6.0', 'wpackagist-plugin/woocommerce': '^3.0'}}),
    )
    const {cmd, get, logs} = make(false)
    get.mockResolvedValue([nativePlugin({plugin: 'woocommerce/woocommerce.php'}), nativePlugin({plugin: 'acf/acf.php'})])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Skipping 2 Composer-managed plugins: woocommerce, acf')
  })

  it('does not log a "Skipping" line when nothing is Composer-managed', async () => {
    const {cmd, get, logs} = make(false)
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php'})])

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Skipping'))
  })

  it('merges with the existing manifest, preserving plugins no longer reported by the site', async () => {
    const {cmd, get} = make(false, {plugins: {'gravity-forms': 'latest'}})
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php'})])

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({akismet: 'latest', 'gravity-forms': 'latest'})
  })

  it('reports the newly added plugin under "+ Added" on a real run', async () => {
    const {cmd, get, logs} = make(false, {plugins: {'gravity-forms': 'latest'}})
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php'})])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  + Added: akismet')
  })

  it('does not log an "Added" line when nothing new was pulled', async () => {
    const {cmd, get, logs} = make(false, {plugins: {akismet: 'latest'}})
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php'})])

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Added'))
  })

  it('comma-separates more than one newly added plugin under "+ Added" on a real run', async () => {
    const {cmd, get, logs} = make(false)
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php'}), nativePlugin({plugin: 'woocommerce/woocommerce.php'})])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  + Added: akismet, woocommerce')
  })

  it('does not log a "+" line on dry-run when nothing was added', async () => {
    const {cmd, get, logs} = make(true, {plugins: {akismet: 'latest'}})
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php'})])

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('+'))
  })

  it('comma-separates more than one newly added plugin under "+" on a dry run', async () => {
    const {cmd, get, logs} = make(true)
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php'}), nativePlugin({plugin: 'woocommerce/woocommerce.php'})])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  + akismet, woocommerce')
  })

  it('reports a version pinned locally changing back to "latest" under "~ Updated" on a real run', async () => {
    const {cmd, get, logs} = make(false, {plugins: {woocommerce: '8.9.1'}})
    get.mockResolvedValue([nativePlugin({plugin: 'woocommerce/woocommerce.php'})])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  ~ Updated: woocommerce 8.9.1 → latest')
    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({woocommerce: 'latest'})
  })

  it('returns the added/merged/updated/status result shape on a real run', async () => {
    const {cmd, get} = make(false, {plugins: {woocommerce: '8.9.1'}})
    get.mockResolvedValue([nativePlugin({plugin: 'woocommerce/woocommerce.php'}), nativePlugin({plugin: 'akismet/akismet.php'})])

    const result = await cmd.run()

    expect(result).toEqual({
      added: ['akismet'],
      merged: {akismet: 'latest', woocommerce: 'latest'},
      status: 'success',
      updated: [{from: '8.9.1', slug: 'woocommerce', to: 'latest'}],
    })
  })

  it('writes nothing to loopress.json on a dry run', async () => {
    const {cmd, get, logs} = make(true)
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php'})])

    await cmd.run()

    expect(existsSync(join(dir, 'loopress.json'))).toBe(false)
    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would write 1 plugins to loopress.json')
  })

  it('reports added/updated plugins with dry-run-specific wording, without writing anything', async () => {
    const {cmd, get, logs} = make(true, {plugins: {woocommerce: '8.9.1'}})
    get.mockResolvedValue([nativePlugin({plugin: 'woocommerce/woocommerce.php'}), nativePlugin({plugin: 'akismet/akismet.php'})])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  + akismet')
    expect(logs.log).toHaveBeenCalledWith('  ~ woocommerce (8.9.1 → latest)')
    expect(existsSync(join(dir, 'loopress.json'))).toBe(false)
  })

  it('returns the added/merged/updated/status result shape on a dry run', async () => {
    const {cmd, get} = make(true, {plugins: {woocommerce: '8.9.1'}})
    get.mockResolvedValue([nativePlugin({plugin: 'woocommerce/woocommerce.php'})])

    const result = await cmd.run()

    expect(result).toEqual({
      added: [],
      merged: {woocommerce: 'latest'},
      status: 'dry-run',
      updated: [{from: '8.9.1', slug: 'woocommerce', to: 'latest'}],
    })
  })

  it('treats a plugin reported as inactive by the site the same as an active one (only status matters for install/activate, not pull)', async () => {
    const {cmd, get} = make(false)
    get.mockResolvedValue([nativePlugin({plugin: 'akismet/akismet.php', status: 'inactive'})])

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({akismet: 'latest'})
  })
})
