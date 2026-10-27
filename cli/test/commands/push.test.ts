import {confirm} from '@inquirer/prompts'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../src/commands/push.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
import {type LoopressLocalConfig} from '../../src/utils/loopress-config.js'
import {makeCapabilities, stubCapabilities} from '../helpers/capabilities.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

// Tests run without a TTY; keep that default and flip to true only in the tests that cover
// the interactive confirmation path (same convention as test/lib/push-command.test.ts).
const interactive = vi.hoisted(() => ({value: false}))
vi.mock('../../src/lib/interactive.js', () => ({
  isInteractive: () => interactive.value,
}))

const ALL_COMMAND_IDS = [
  'plugin:push',
  'composer:push',
  'cpt:push',
  'taxonomy:push',
  'meta:push',
  'role:push',
  'acf:push',
  'api:push',
  'hook:push',
  'form:push',
  'pattern:push',
  'theme:template:push',
  'theme:style:push',
  'page:push',
  'menu:push',
  'option:push',
  'snippet:push',
]

// The default fixture manages plugins through loopress.json and has no composer.json, so
// composer:push is skipped as unconfigured.
const DELEGATED_IDS = ALL_COMMAND_IDS.filter((id) => id !== 'composer:push')

// What `wp/v2/themes` answers: by default a block theme, matching the Global Styles file every
// test project tracks.
const ACTIVE_BLOCK_THEME = [{status: 'active', stylesheet: 'bakery', theme_supports: {'block-templates': true}}]
const themes = vi.hoisted(() => ({value: [] as unknown[]}))

class TestPush extends Push {
  setup(options: {
    dryRun?: boolean | undefined
    localConfig?: LoopressLocalConfig | undefined
    overwrite?: boolean | undefined
    siteConfig: EnvironmentConfig
    yes?: boolean | undefined
  }) {
    this.dryRun = options.dryRun ?? false
    this.overwrite = options.overwrite ?? false
    this.yes = options.yes ?? false
    this.siteConfig = options.siteConfig
    this.localConfig = options.localConfig ?? {plugins: {akismet: '5.3.3'}}
  }
}

function make(
  options: {
    capabilities?: ReturnType<typeof makeCapabilities>
    dryRun?: boolean
    localConfig?: LoopressLocalConfig
    overwrite?: boolean
    siteConfig?: EnvironmentConfig
    yes?: boolean
  } = {},
) {
  const cmd = new TestPush([], fakeOclifConfig)
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get: vi.fn(async () => themes.value)}
  stubCapabilities(cmd, options.capabilities ?? makeCapabilities())
  cmd.setup({
    dryRun: options.dryRun,
    localConfig: options.localConfig,
    overwrite: options.overwrite,
    siteConfig: options.siteConfig ?? makeEnv('staging', 'https://staging.acme.com'),
    yes: options.yes,
  })
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('push', () => {
  let projectDir: string

  beforeEach(() => {
    resetFakeOclifConfig()
    vi.clearAllMocks()
    interactive.value = false
    // An empty project: the cli/ package's own composer.json must not count as the project's.
    projectDir = mkdtempSync(join(tmpdir(), 'lps-push-test-'))
    // Plugin-backed pushes and Global Styles are skipped when the project doesn't use them, see
    // the dedicated tests below.
    for (const dir of ['acf', 'forms', 'snippets', 'theme']) mkdirSync(join(projectDir, dir))
    writeFileSync(join(projectDir, 'theme', 'bakery-global-styles.json'), '{}')
    themes.value = ACTIVE_BLOCK_THEME
    vi.spyOn(process, 'cwd').mockReturnValue(projectDir)
  })

  afterEach(() => {
    vi.mocked(process.cwd).mockRestore()
    rmSync(projectDir, {force: true, recursive: true})
  })

  it('skips composer:push when plugin:push already pushes a composer.json that declares plugins', async () => {
    writeFileSync(join(projectDir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/akismet': '5.3.3'}}))
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make()

    await cmd.run()

    const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
    expect(ran).toEqual(ALL_COMMAND_IDS.filter((id) => id !== 'composer:push'))
    expect(logs.log).toHaveBeenCalledWith('\n→ composer: already pushed whole by plugins')
  })

  it('delegates to every resource push, in dependency order, with the resolved env and --yes', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({siteConfig: makeEnv('staging', 'https://staging.acme.com')})

    await cmd.run()

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(DELEGATED_IDS.length)
    for (const [index, commandId] of DELEGATED_IDS.entries()) {
      expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(index + 1, commandId, ['--env', 'staging', '--yes'])
    }
  })

  it('forwards --dry-run to every delegated push', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({dryRun: true})

    await cmd.run()

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('plugin:push', ['--env', 'staging', '--yes', '--dry-run'])
  })

  // --yes is always forwarded, so it must never stand in for --overwrite.
  it('forwards --overwrite only when given', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    await make().cmd.run()
    expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('plugin:push', ['--env', 'staging', '--yes'])

    await make({overwrite: true}).cmd.run()
    expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('plugin:push', ['--env', 'staging', '--yes', '--overwrite'])
  })

  it('reports success once every resource pushed', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make()

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('\nAll resources pushed.')
  })

  it('returns a per-resource result for --json, so push_all in the MCP server has something to parse', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make()

    const result = await cmd.run()

    expect(result.results).toHaveLength(ALL_COMMAND_IDS.length)
    expect(result.results.filter((entry) => entry.status !== 'pushed')).toEqual([{label: 'composer', status: 'skipped'}])
  })

  // Unconfigured is the common case, not a failure: it must not stop the run before anything
  // else is pushed.
  it('skips plugins and composer when the project manages neither', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make({localConfig: {}})

    await cmd.run()

    const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
    expect(ran).toEqual(ALL_COMMAND_IDS.filter((id) => id !== 'plugin:push' && id !== 'composer:push'))
    expect(logs.log).toHaveBeenCalledWith('\n→ plugins: not configured, skipped')
    expect(logs.log).toHaveBeenCalledWith('\n→ composer: not configured, skipped')
    expect(logs.log).toHaveBeenCalledWith('\nAll resources pushed.')
  })

  it('skips snippets when the project has no snippets directory, instead of failing on ENOENT', async () => {
    rmSync(join(projectDir, 'snippets'), {recursive: true})
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make()

    await cmd.run()

    const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
    expect(ran).not.toContain('snippet:push')
    expect(logs.log).toHaveBeenCalledWith('\n→ snippets: not configured, skipped')
  })

  // A dry run reads the site, so a missing form plugin used to fail it with a 409 (and warn on a
  // real push) for a project that has no forms at all. Same for ACF.
  it.each([
    ['forms', 'form:push', 'forms'],
    ['acf', 'acf:push', 'ACF'],
  ])('skips %s when the project has no directory for it, dry run included', async (dir, commandId, label) => {
    rmSync(join(projectDir, dir), {recursive: true})
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})

    for (const dryRun of [false, true]) {
      vi.mocked(fakeOclifConfig.runCommand).mockClear()
      const {cmd, logs} = make({dryRun})

      await cmd.run()

      const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
      expect(ran).not.toContain(commandId)
      expect(logs.log).toHaveBeenCalledWith(`\n→ ${label}: not configured, skipped`)
    }
  })

  describe('a resource the project uses on a site that cannot hold it', () => {
    it('refuses before pushing anything, saying which plugin to declare', async () => {
      const {cmd} = make({capabilities: makeCapabilities({integrations: {snippets: false}})})

      await expect(cmd.run()).rejects.toThrow(
        /Nothing was pushed[\s\S]*snippets: no supported snippet plugin is active on staging\. Declare code-snippets \(or insert-headers-and-footers\) \("code-snippets" in loopress\.json plugins\), then activate it/,
      )
      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
    })

    it('says to activate a plugin composer.json already declares', async () => {
      writeFileSync(join(projectDir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/code-snippets': '3.6.0'}}))
      const {cmd} = make({capabilities: makeCapabilities({integrations: {snippets: false}})})

      await expect(cmd.run()).rejects.toThrow(/The project declares code-snippets, activate it: `lps plugin push --activate`/)
    })

    it('names every blocked resource at once, dry run included', async () => {
      const {cmd} = make({capabilities: makeCapabilities({integrations: {acf: false, form: false}}), dryRun: true})

      await expect(cmd.run()).rejects.toThrow(/ACF: ACF is not active[\s\S]*forms: no supported form plugin is active/)
      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
    })

    it('points a Loopress Light site at Full for snippets', async () => {
      const {cmd} = make({capabilities: makeCapabilities({edition: 'light', integrations: {snippets: undefined}})})

      await expect(cmd.run()).rejects.toThrow(/snippets: snippets need Loopress Full on staging\. Install Loopress Full\./)
    })
  })

  describe('Global Styles', () => {
    function ranStyles(): boolean {
      return vi.mocked(fakeOclifConfig.runCommand).mock.calls.some(([id]) => id === 'theme:style:push')
    }

    it('pushes them right after templates and parts when the active block theme has its file', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      await make().cmd.run()

      const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
      expect(ran.indexOf('theme:style:push')).toBe(ran.indexOf('theme:template:push') + 1)
    })

    it('skips them without asking the site when the project tracks none', async () => {
      rmSync(join(projectDir, 'theme', 'bakery-global-styles.json'))
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd, logs} = make()

      await cmd.run()

      expect(ranStyles()).toBe(false)
      expect(logs.log).toHaveBeenCalledWith('\n→ Global Styles: not configured, skipped')
    })

    it('skips them on a classic theme instead of failing the run', async () => {
      themes.value = [{status: 'active', stylesheet: 'storefront', theme_supports: {}}]
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd, logs} = make()

      await cmd.run()

      expect(ranStyles()).toBe(false)
      expect(logs.log).toHaveBeenCalledWith('\n→ Global Styles: the active theme "storefront" is a classic theme, skipped')
      expect(logs.log).toHaveBeenCalledWith('\nAll resources pushed.')
    })

    it('skips them when the only file is for another theme than the active one', async () => {
      themes.value = [{status: 'active', stylesheet: 'twentytwentyfive', theme_supports: {'block-templates': true}}]
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd, logs} = make()

      await cmd.run()

      expect(ranStyles()).toBe(false)
      expect(logs.log).toHaveBeenCalledWith('\n→ Global Styles: no file for the active theme "twentytwentyfive", skipped')
    })

    it('lets the step run and report it when the theme list cannot be read', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd} = make()
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {get: vi.fn().mockRejectedValue(new Error('down'))}

      await cmd.run()

      expect(ranStyles()).toBe(true)
    })
  })

  it('stops at the first failed resource and names the ones not attempted', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'))
    const {cmd, logs} = make()

    await expect(cmd.run()).rejects.toThrow('post types failed to push: boom. Not attempted: taxonomies, post meta,')

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(2)
    expect(logs.log).toHaveBeenCalledWith('✗ post types failed: boom')
  })

  it('names nothing as skipped when the last resource fails', async () => {
    const calls = vi.mocked(fakeOclifConfig.runCommand)
    for (let i = 0; i < DELEGATED_IDS.length - 1; i++) calls.mockResolvedValueOnce({})
    calls.mockRejectedValueOnce(new Error('bang'))
    const {cmd} = make()

    await expect(cmd.run()).rejects.toThrow(/^snippets failed to push: bang\.$/)
  })

  describe('production guard', () => {
    it('asks once before pushing anything, in a TTY', async () => {
      interactive.value = true
      vi.mocked(confirm).mockResolvedValueOnce(true)
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd} = make({siteConfig: makeEnv('production', 'https://acme.com')})

      await cmd.run()

      expect(confirm).toHaveBeenCalledTimes(1)
      expect(confirm).toHaveBeenCalledWith({default: true, message: 'Push to production (https://acme.com)?'})
      expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('plugin:push', ['--env', 'production', '--yes'])
    })

    it('aborts without delegating when declined', async () => {
      interactive.value = true
      vi.mocked(confirm).mockResolvedValueOnce(false)
      const {cmd} = make({siteConfig: makeEnv('production', 'https://acme.com')})

      await expect(cmd.run()).rejects.toThrow('Aborted.')

      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
    })

    it('refuses outside a TTY without --yes', async () => {
      const {cmd} = make({siteConfig: makeEnv('production', 'https://acme.com')})

      await expect(cmd.run()).rejects.toThrow(/production.*--yes/)
      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
    })

    it('skips the prompt with --yes', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd} = make({siteConfig: makeEnv('production', 'https://acme.com'), yes: true})

      await cmd.run()

      expect(confirm).not.toHaveBeenCalled()
    })

    it('skips the prompt on dry-run', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd} = make({dryRun: true, siteConfig: makeEnv('production', 'https://acme.com')})

      await cmd.run()

      expect(confirm).not.toHaveBeenCalled()
    })
  })
})
