import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/theme-styles/pull.js'
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

function activeTheme(stylesheet: string, isBlockTheme = true) {
  return {
    _links: {'wp:user-global-styles': [{href: `https://acme.com/wp-json/wp/v2/global-styles/7`}]},
    status: 'active',
    stylesheet,
    theme_supports: {'block-templates': isBlockTheme},
  }
}

describe('theme-styles pull', () => {
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
    dir = mkdtempSync(join(tmpdir(), 'lps-theme-styles-pull-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('writes the active theme Global Styles to <stylesheet>-global-styles.json', async () => {
    const {cmd, get} = make(false, {rootDir: dir})
    get.mockImplementation(async (path: string) => {
      if (path === 'wp/v2/themes') return [activeTheme('twentytwentyfour')]
      return {settings: {color: {palette: []}}, styles: {}}
    })

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'theme', 'twentytwentyfour-global-styles.json'), 'utf8'))
    expect(written).toEqual({settings: {color: {palette: []}}, styles: {}})
  })

  it('fails clearly when the active theme is a classic theme', async () => {
    const {cmd, get} = make(false, {rootDir: dir})
    get.mockImplementation(async (path: string) => {
      if (path === 'wp/v2/themes') return [activeTheme('astra', false)]
      return {}
    })

    await expect(cmd.run()).rejects.toThrow(/classic theme/)
  })

  it('writes nothing on a dry run', async () => {
    const {cmd, get, logs} = make(true, {rootDir: dir})
    get.mockImplementation(async (path: string) => {
      if (path === 'wp/v2/themes') return [activeTheme('twentytwentyfour')]
      return {settings: {}, styles: {}}
    })

    await cmd.run()

    expect(existsSync(join(dir, 'theme'))).toBe(false)
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
  })

  it('drops the id and _links bookkeeping fields from the written file', async () => {
    const {cmd, get} = make(false, {rootDir: dir})
    get.mockImplementation(async (path: string) => {
      if (path === 'wp/v2/themes') return [activeTheme('twentytwentyfour')]
      return {_links: {self: [{href: 'x'}]}, id: 9, settings: {}, styles: {}}
    })

    await cmd.run()

    const written = JSON.parse(await readFile(join(dir, 'theme', 'twentytwentyfour-global-styles.json'), 'utf8'))
    expect(written).toEqual({settings: {}, styles: {}})
  })
})
