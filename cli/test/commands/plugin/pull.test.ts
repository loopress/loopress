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

  it('records inactive plugins as such, so a later push does not switch them on', async () => {
    const {cmd, get, logs} = make(false, {plugins: {'hello-dolly': '1.7.2'}})
    get.mockResolvedValue([
      nativePlugin({plugin: 'akismet/akismet.php', version: '5.3.3'}),
      nativePlugin({plugin: 'hello-dolly/hello-dolly.php', status: 'inactive', version: '1.7.2'}),
    ])

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({akismet: '5.3.3', 'hello-dolly': {active: false, version: '1.7.2'}})
    expect(logs.log).toHaveBeenCalledWith('  ~ Updated: hello-dolly 1.7.2 → 1.7.2 (inactive)')
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

  describe('with a composer.json', () => {
    const site = [
      nativePlugin({plugin: 'akismet/akismet.php', version: '5.3.3'}),
      nativePlugin({plugin: 'woocommerce/woocommerce.php', version: '9.5.0'}),
      nativePlugin({plugin: 'redirection/redirection.php', version: '5.5.0'}),
      nativePlugin({plugin: 'query-monitor/query-monitor.php', version: '3.1.0'}),
      nativePlugin({plugin: 'acme-blocks/acme-blocks.php', version: '2.0.0'}),
      nativePlugin({plugin: 'advanced-custom-fields-pro/acf.php', version: '6.3.0'}),
    ]
    const composerJson = {
      name: 'acme/site',
      require: {
        'acme/acme-blocks': '^2.0',
        'monolog/monolog': '^3.0',
        'wpackagist-plugin/redirection': '5.4.0',
        'wpackagist-plugin/woocommerce': '^9.4',
      },
      'require-dev': {'wpackagist-plugin/query-monitor': '3.0.0'},
    }
    let fetch: ReturnType<typeof vi.fn>

    beforeEach(() => {
      writeFileSync(join(dir, 'composer.json'), JSON.stringify(composerJson))
      // Only akismet is on WordPress.org among the undeclared slugs; ACF Pro is premium.
      fetch = vi.fn(async (url: string) => new Response('{}', {status: url.endsWith('slug=akismet') ? 200 : 404}))
      vi.stubGlobal('fetch', fetch)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('adds what WPackagist serves, moves exact pins, and leaves constraints and other packages alone', async () => {
      const {cmd, get, logs} = make(false, {plugins: {ignored: '1.0.0'}})
      get.mockResolvedValue(site)

      const result = await cmd.run()

      const written = JSON.parse(await readFile(join(dir, 'composer.json'), 'utf8'))
      expect(written).toEqual({
        ...composerJson,
        require: {
          ...composerJson.require,
          'wpackagist-plugin/akismet': '5.3.3',
          'wpackagist-plugin/redirection': '5.5.0',
        },
      })
      expect(result).toEqual({
        added: ['akismet'],
        merged: {akismet: '5.3.3', redirection: '5.5.0'},
        skipped: [
          {reason: 'keeps constraint ^9.4, live 9.5.0', slug: 'woocommerce'},
          {reason: 'declared in require-dev', slug: 'query-monitor'},
          {reason: 'provided by acme/acme-blocks', slug: 'acme-blocks'},
          {reason: 'not on WordPress.org', slug: 'advanced-custom-fields-pro'},
        ],
        status: 'success',
        updated: [{from: '5.4.0', slug: 'redirection', to: '5.5.0'}],
      })
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(logs.log).toHaveBeenCalledWith('  - Skipped: advanced-custom-fields-pro (not on WordPress.org)')
      expect(existsSync(join(dir, 'loopress.json'))).toBe(false)
    })

    it('writes nothing on a dry run', async () => {
      const {cmd, get, logs} = make(true)
      get.mockResolvedValue(site)

      const result = await cmd.run()

      expect(result.status).toBe('dry-run')
      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pin 2 plugins in composer.json')
      expect(JSON.parse(await readFile(join(dir, 'composer.json'), 'utf8'))).toEqual(composerJson)
    })

    it('fails with an explicit message, without touching composer.json, when WordPress.org answers an error', async () => {
      fetch.mockResolvedValue(new Response('', {status: 503}))
      const {cmd, get} = make(false)
      get.mockResolvedValue(site)

      await expect(cmd.run()).rejects.toThrow(
        'Could not check whether the plugin "akismet" is on WordPress.org (HTTP 503), so composer.json was not modified.',
      )
      expect(JSON.parse(await readFile(join(dir, 'composer.json'), 'utf8'))).toEqual(composerJson)
    })

    it('names the network error when WordPress.org is unreachable', async () => {
      fetch.mockRejectedValue(new TypeError('fetch failed'))
      const {cmd, get} = make(false)
      get.mockResolvedValue(site)

      await expect(cmd.run()).rejects.toThrow('(network error: fetch failed)')
    })

    it.each([
      ['4 spaces', ' '.repeat(4)],
      ['tabs', '\t'],
    ])('keeps the original indentation (%s) and trailing newline', async (_label, indent) => {
      writeFileSync(join(dir, 'composer.json'), JSON.stringify(composerJson, null, indent) + '\n')
      const {cmd, get, logs} = make(false)
      get.mockResolvedValue(site)

      await cmd.run()

      const expected = {
        ...composerJson,
        require: {
          ...composerJson.require,
          'wpackagist-plugin/akismet': '5.3.3',
          'wpackagist-plugin/redirection': '5.5.0',
        },
      }
      expect(await readFile(join(dir, 'composer.json'), 'utf8')).toBe(JSON.stringify(expected, null, indent) + '\n')
      expect(logs.log).toHaveBeenCalledWith('Run `lps composer push` to apply.')
    })
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
