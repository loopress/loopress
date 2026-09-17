import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/theme-styles/push.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

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

describe('theme-styles push', () => {
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

    await expect(cmd.run()).rejects.toThrow(/Run `lps theme-styles pull` first/)
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
})
