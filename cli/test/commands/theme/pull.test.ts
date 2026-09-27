import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/theme/pull.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type PullInternals = {
  dryRun: boolean
  localConfig: LoopressLocalConfig
  siteConfig: EnvironmentConfig
  wpClient: {get: ReturnType<typeof vi.fn>}
}

const nativeTheme = (stylesheet: string, version = '1.0.0', status: 'active' | 'inactive' = 'inactive') => ({
  status,
  stylesheet,
  version,
})

describe('theme pull', () => {
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
    dir = mkdtempSync(join(tmpdir(), 'lps-theme-pull-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(dir, {force: true, recursive: true})
  })

  it('pins every installed theme to the version running on the site', async () => {
    const {cmd, get, logs} = make(false)
    get.mockResolvedValue([nativeTheme('generatepress', '3.4.0')])

    await cmd.run()

    expect(get).toHaveBeenCalledWith('wp/v2/themes')
    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.themes).toEqual({generatepress: '3.4.0'})
    expect(logs.log).toHaveBeenCalledWith('Wrote 1 themes to loopress.json')
  })

  it('pins live versions into composer.json instead of loopress.json when one exists', async () => {
    writeFileSync(
      join(dir, 'composer.json'),
      JSON.stringify({
        name: 'acme/site',
        require: {'wpackagist-theme/astra': '4.0.0', 'wpackagist-plugin/akismet': '5.3.3'},
      }),
    )
    const fetch = vi.fn().mockResolvedValue(new Response('{}', {status: 200}))
    vi.stubGlobal('fetch', fetch)
    const {cmd, get} = make(false, {themes: {ignored: '1.0.0'}})
    get.mockResolvedValue([nativeTheme('astra', '4.1.0'), nativeTheme('generatepress', '3.4.0')])

    const result = await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'composer.json'), 'utf8'))
    expect(written).toEqual({
      name: 'acme/site',
      require: {
        'wpackagist-plugin/akismet': '5.3.3',
        'wpackagist-theme/astra': '4.1.0',
        'wpackagist-theme/generatepress': '3.4.0',
      },
    })
    expect(result).toEqual({
      added: ['generatepress'],
      merged: {astra: '4.1.0', generatepress: '3.4.0'},
      skipped: [],
      status: 'success',
      updated: [{from: '4.0.0', slug: 'astra', to: '4.1.0'}],
    })
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('themes/info/1.2/?action=theme_information&slug=generatepress'),
    )
    expect(existsSync(join(dir, 'loopress.json'))).toBe(false)
  })

  it('merges with the existing manifest, preserving themes no longer reported by the site', async () => {
    const {cmd, get} = make(false, {themes: {astra: '4.0.0'}})
    get.mockResolvedValue([nativeTheme('generatepress', '3.4.0')])

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.themes).toEqual({astra: '4.0.0', generatepress: '3.4.0'})
  })

  it('reports a version change under "~ Updated" on a real run', async () => {
    const {cmd, get, logs} = make(false, {themes: {generatepress: '3.3.0'}})
    get.mockResolvedValue([nativeTheme('generatepress', '3.4.0')])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  ~ Updated: generatepress 3.3.0 → 3.4.0')
    const written = JSON.parse(await readFile(join(dir, 'loopress.json'), 'utf8'))
    expect(written.themes).toEqual({generatepress: '3.4.0'})
  })

  it('returns the added/merged/updated/status result shape on a real run', async () => {
    const {cmd, get} = make(false, {themes: {generatepress: '3.4.0'}})
    get.mockResolvedValue([nativeTheme('generatepress', '3.4.0'), nativeTheme('astra', '4.0.0')])

    const result = await cmd.run()

    expect(result).toEqual({
      added: ['astra'],
      merged: {astra: '4.0.0', generatepress: '3.4.0'},
      status: 'success',
      updated: [],
    })
  })

  it('logs "Added" only when there is something new, not on every run', async () => {
    const {cmd, get, logs} = make(false, {themes: {generatepress: '3.4.0'}})
    get.mockResolvedValue([nativeTheme('generatepress', '3.4.0')])

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Added'))
  })

  it('writes nothing to loopress.json on a dry run', async () => {
    const {cmd, get, logs} = make(true)
    get.mockResolvedValue([nativeTheme('generatepress', '3.4.0')])

    await cmd.run()

    expect(existsSync(join(dir, 'loopress.json'))).toBe(false)
    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would write 1 themes to loopress.json')
  })
})
