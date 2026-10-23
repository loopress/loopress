import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../../src/commands/theme/style/push.js'
import {type EnvironmentConfig} from '../../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../../helpers/oclif.js'
import {makeEnv} from '../../../helpers/project-fixtures.js'

class TestPush extends Push {
  protected override async guardProductionPush(): Promise<void> {}
  protected override async recordDeployment(): Promise<void> {}

  setup(config: LoopressLocalConfig, siteConfig: EnvironmentConfig, dryRun = false) {
    this.localConfig = config
    this.siteConfig = siteConfig
    this.dryRun = dryRun
  }
}

function activeTheme(stylesheet: string, options: {isBlockTheme?: boolean; withLink?: boolean} = {}) {
  const {isBlockTheme = true, withLink = true} = options
  return {
    _links: withLink ? {'wp:user-global-styles': [{href: 'https://acme.com/wp-json/wp/v2/global-styles/99'}]} : undefined,
    status: 'active',
    stylesheet,
    theme_supports: {'block-templates': isBlockTheme},
  }
}

function make(config: LoopressLocalConfig, argv: string[] = [], dryRun = false) {
  const cmd = new TestPush(argv, fakeOclifConfig)
  cmd.setup(config, makeEnv('production', 'https://acme.com'), dryRun)
  const logs = silenceLogs(cmd)
  const get = vi.fn()
  const post = vi.fn().mockResolvedValue({})
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, post}
  return {cmd, get, logs, post}
}

describe('theme style push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-theme-styles-push-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('posts the local settings/styles to the resolved editable global styles id', async () => {
    mkdirSync(join(dir, 'theme'), {recursive: true})
    writeFileSync(
      join(dir, 'theme', 'twentytwentyfour-global-styles.json'),
      JSON.stringify({settings: {color: {palette: []}}, styles: {}}),
    )
    const {cmd, get, post} = make({rootDir: dir})
    get.mockResolvedValue([activeTheme('twentytwentyfour')])

    await cmd.run()

    expect(post).toHaveBeenCalledWith('wp/v2/global-styles/99', {settings: {color: {palette: []}}, styles: {}})
  })

  it('fails clearly when no local file exists for the active theme', async () => {
    const {cmd, get} = make({rootDir: dir})
    get.mockResolvedValue([activeTheme('twentytwentyfour')])

    await expect(cmd.run()).rejects.toThrow(/Run `lps theme style pull` first/)
  })

  it('fails clearly when the active theme is a classic theme', async () => {
    const {cmd, get} = make({rootDir: dir})
    get.mockResolvedValue([activeTheme('astra', {isBlockTheme: false})])

    await expect(cmd.run()).rejects.toThrow(/classic theme/)
  })

  it('fails clearly when the editable global styles id cannot be resolved', async () => {
    mkdirSync(join(dir, 'theme'), {recursive: true})
    writeFileSync(join(dir, 'theme', 'twentytwentyfour-global-styles.json'), JSON.stringify({settings: {}, styles: {}}))
    const {cmd, get} = make({rootDir: dir})
    get.mockResolvedValue([activeTheme('twentytwentyfour', {withLink: false})])

    await expect(cmd.run()).rejects.toThrow(/Could not resolve the editable Global Styles post/)
  })

  it('does not call the API on a dry run', async () => {
    mkdirSync(join(dir, 'theme'), {recursive: true})
    writeFileSync(join(dir, 'theme', 'twentytwentyfour-global-styles.json'), JSON.stringify({settings: {}, styles: {}}))
    const {cmd, get, post} = make({rootDir: dir}, [], true)
    get.mockResolvedValue([activeTheme('twentytwentyfour')])

    await cmd.run()

    expect(post).not.toHaveBeenCalled()
  })

  it('defaults missing settings and styles, logs the file and returns it', async () => {
    mkdirSync(join(dir, 'theme'), {recursive: true})
    const file = join(dir, 'theme', 'tt4-global-styles.json')
    writeFileSync(file, '{}')
    const {cmd, get, logs, post} = make({rootDir: dir})
    get.mockResolvedValue([activeTheme('tt4')])

    expect(await cmd.run()).toEqual({file, status: 'success'})

    expect(post).toHaveBeenCalledWith('wp/v2/global-styles/99', {settings: {}, styles: {}})
    expect(logs.log).toHaveBeenCalledWith('Pushing Global Styles to https://acme.com')
    expect(logs.log).toHaveBeenCalledWith(`Pushed: ${file}`)
  })

  it('rethrows a read error other than a missing file', async () => {
    mkdirSync(join(dir, 'theme', 'tt4-global-styles.json'), {recursive: true})
    const {cmd, get, post} = make({rootDir: dir})
    get.mockResolvedValue([activeTheme('tt4')])

    await expect(cmd.run()).rejects.toThrow(/EISDIR/)
    expect(post).not.toHaveBeenCalled()
  })

  it('previews only the active theme file on a dry run', async () => {
    mkdirSync(join(dir, 'theme'), {recursive: true})
    const file = join(dir, 'theme', 'tt4-global-styles.json')
    writeFileSync(file, JSON.stringify({settings: {}, styles: {color: {text: 'red'}}}))
    writeFileSync(join(dir, 'theme', 'other-global-styles.json'), JSON.stringify({settings: {}, styles: {}}))
    const {cmd, get, post} = make({rootDir: dir}, [], true)
    get.mockImplementation(async (path: string) => (path === 'wp/v2/themes' ? [activeTheme('tt4')] : {settings: {}, styles: {}}))

    const result = await cmd.run()

    expect(result).toEqual({changes: [{id: 'tt4', status: 'changed'}], file, status: 'dry-run'})
    expect(post).not.toHaveBeenCalled()
  })
})
