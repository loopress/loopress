import {confirm} from '@inquirer/prompts'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../src/commands/push.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
import {type LoopressLocalConfig} from '../../src/utils/loopress-config.js'
import {makeCapabilities, makeLightCapabilities, stubCapabilities} from '../helpers/capabilities.js'
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
  'block:push',
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

// Directories of the resources every site can hold: a project without one skips its step.
const CORE_DIRS = ['cpt', 'taxonomies', 'meta', 'roles', 'menus', 'options', 'api', 'hooks', 'blocks', 'patterns', 'pages']

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
    argv?: string[]
    capabilities?: ReturnType<typeof makeCapabilities>
    dryRun?: boolean
    localConfig?: LoopressLocalConfig
    overwrite?: boolean
    siteConfig?: EnvironmentConfig
    yes?: boolean
  } = {},
) {
  const cmd = new TestPush(options.argv ?? [], fakeOclifConfig)
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
    for (const dir of [...CORE_DIRS, 'acf', 'forms', 'snippets', 'theme', 'theme/templates']) mkdirSync(join(projectDir, dir))
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

  it('--only pushes just those resources, in push order, and reports the rest skipped', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({argv: ['--only', 'page,acf']})

    const {results} = await cmd.run()

    const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
    expect(ran).toEqual(['acf:push', 'page:push'])
    expect(results.find((r) => r.label === 'snippets')?.status).toBe('skipped')
    expect(results.find((r) => r.label === 'pages')?.status).toBe('pushed')
  })

  it('--skip leaves a target out of the site checks so it cannot block the run', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({argv: ['--skip', 'plugin,template,api,hook,block,page,pattern', '--skip', 'snippet'], capabilities: makeLightCapabilities()})

    const {results} = await cmd.run()

    expect(results.find((r) => r.label === 'plugins')?.status).toBe('skipped')
    expect(results.find((r) => r.label === 'snippets')?.status).toBe('skipped')
  })

  it('says a narrowed run pushed only the selected resources', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make({argv: ['--only', 'page']})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('\nSelected resources pushed, the others are skipped.')
    expect(logs.log).not.toHaveBeenCalledWith('\nAll resources pushed.')
  })

  it('refuses --skip composer when plugin push would run Composer from composer.json', async () => {
    writeFileSync(join(projectDir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/akismet': '5.3.3'}}))
    const {cmd} = make({argv: ['--skip', 'composer']})

    await expect(cmd.run()).rejects.toThrow('--skip composer conflicts with pushing plugins')
    expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
  })

  it('reports composer pushed by plugins when --only plugin syncs composer.json', async () => {
    writeFileSync(join(projectDir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/akismet': '5.3.3'}}))
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({argv: ['--only', 'plugin']})

    const {results} = await cmd.run()

    expect(vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)).toEqual(['plugin:push'])
    expect(results.find((r) => r.label === 'composer')?.status).toBe('pushed')
  })

  it('rejects an unknown --only resource', async () => {
    const {cmd} = make({argv: ['--only', 'nope']})

    await expect(cmd.run()).rejects.toThrow('Unknown resource "nope" in --only')
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

  it.each([
    ['cpt', 'cpt:push', 'post types'],
    ['taxonomies', 'taxonomy:push', 'taxonomies'],
    ['meta', 'meta:push', 'post meta'],
    ['roles', 'role:push', 'roles'],
    ['menus', 'menu:push', 'menus'],
    ['options', 'option:push', 'options'],
    ['api', 'api:push', 'API routes'],
    ['hooks', 'hook:push', 'hooks'],
    ['blocks', 'block:push', 'dynamic blocks'],
    ['patterns', 'pattern:push', 'patterns'],
    ['pages', 'page:push', 'pages'],
  ])('skips %s when the project has no directory for it', async (dir, commandId, label) => {
    rmSync(join(projectDir, dir), {recursive: true})
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make()

    await cmd.run()

    const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
    expect(ran).not.toContain(commandId)
    expect(logs.log).toHaveBeenCalledWith(`\n→ ${label}: not configured, skipped`)
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

    it('lets it through when loopress.json pins the plugin active: the plugins step installs it first', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd} = make({
        capabilities: makeCapabilities({integrations: {acf: false}}),
        localConfig: {plugins: {'advanced-custom-fields': '6.8.10'}},
      })

      await cmd.run()

      const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
      expect(ran).toContain('plugin:push')
      expect(ran.indexOf('plugin:push')).toBeLessThan(ran.indexOf('acf:push'))
    })

    it('skips the step on dry-run: nothing activates the plugin, so the site has nothing to preview against', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd, logs} = make({
        capabilities: makeCapabilities({integrations: {acf: false}}),
        dryRun: true,
        localConfig: {plugins: {'advanced-custom-fields': '6.8.10'}},
      })

      const result = await cmd.run()

      const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
      expect(ran).toContain('plugin:push')
      expect(ran).not.toContain('acf:push')
      expect(result.results).toContainEqual({label: 'ACF', status: 'skipped'})
      expect(logs.log).toHaveBeenCalledWith('\n→ ACF: ACF is not active until this push activates it, skipped')
    })

    it('still refuses when loopress.json pins the plugin inactive', async () => {
      const {cmd} = make({
        capabilities: makeCapabilities({integrations: {acf: false}}),
        localConfig: {plugins: {'advanced-custom-fields': {active: false, version: '6.8.10'}}},
      })

      await expect(cmd.run()).rejects.toThrow(/ACF: ACF is not active on staging\. The project declares advanced-custom-fields, activate it/)
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
      const {cmd} = make({capabilities: makeLightCapabilities()})

      await expect(cmd.run()).rejects.toThrow(/snippets: snippets need Loopress Full on staging\. Install Loopress Full\./)
    })

    it('refuses on Light a Full-only feature or plugins the project uses, dry run included', async () => {
      const {cmd} = make({capabilities: makeLightCapabilities(), dryRun: true})

      await expect(cmd.run()).rejects.toThrow(/plugins: plugins and Composer need Loopress Full[\s\S]*hooks: hooks need Loopress Full/)
      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
    })

    it('with --skip-unsupported, skips what the site cannot hold instead of refusing, and warns with the fix', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd, logs} = make({argv: ['--skip-unsupported'], capabilities: makeCapabilities({integrations: {acf: false, form: false}})})

      const result = await cmd.run()

      const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
      expect(ran).not.toContain('acf:push')
      expect(ran).not.toContain('form:push')
      expect(ran).toContain('page:push')
      expect(result.results).toContainEqual({label: 'ACF', reason: 'ACF is not active on staging', status: 'skipped'})
      expect(logs.log).toHaveBeenCalledWith('\n→ ACF: ACF is not active, skipped (--skip-unsupported)')
      expect(logs.warn).toHaveBeenCalledWith(expect.stringMatching(/ACF: ACF is not active on staging\.[\s\S]*forms: no supported form plugin is active on staging\./))
    })

    it('with --skip-unsupported, skips a Full feature on Light and exits cleanly', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd, logs} = make({argv: ['--skip-unsupported'], capabilities: makeLightCapabilities()})

      await expect(cmd.run()).resolves.toBeDefined()

      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalledWith('hook:push', expect.anything())
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('hooks: hooks need Loopress Full on staging. Install Loopress Full.'))
    })

    it('does not warn with --skip-unsupported when the site holds everything', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd, logs} = make({argv: ['--skip-unsupported']})

      await cmd.run()

      expect(logs.warn).not.toHaveBeenCalled()
    })

    it('skips on Light what needs Full when the project does not use it', async () => {
      for (const dir of ['snippets', 'theme/templates', 'api', 'hooks', 'blocks', 'patterns', 'pages']) rmSync(join(projectDir, dir), {recursive: true})
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd, logs} = make({capabilities: makeLightCapabilities(), localConfig: {}})

      await cmd.run()

      const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
      expect(ran).toEqual(['cpt:push', 'taxonomy:push', 'meta:push', 'role:push', 'acf:push', 'form:push', 'theme:style:push', 'menu:push', 'option:push'])
      expect(logs.log).toHaveBeenCalledWith('\n→ hooks: hooks need Loopress Full, skipped')
      expect(logs.log).toHaveBeenCalledWith('\n→ API routes: API routes need Loopress Full, skipped')
      expect(logs.log).toHaveBeenCalledWith('\n→ snippets: snippets need Loopress Full, skipped')
    })
  })

  describe('templates and parts', () => {
    it('skips them when the project has no template, part or CSS directory', async () => {
      rmSync(join(projectDir, 'theme/templates'), {recursive: true})
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd, logs} = make({dryRun: true})

      await cmd.run()

      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalledWith('theme:template:push', expect.anything())
      expect(logs.log).toHaveBeenCalledWith('\n→ templates and parts: not configured, skipped')
    })

    it('skips them even when loopress.json asks for the child theme, which would be empty', async () => {
      rmSync(join(projectDir, 'theme/templates'), {recursive: true})
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      await make({localConfig: {activateChildTheme: true, plugins: {akismet: '5.3.3'}}}).cmd.run()

      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalledWith('theme:template:push', expect.anything())
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

  it('announces each resource, confirms what pushed and says what it skipped', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make()

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('\n→ Pushing post types...')
    expect(logs.log).toHaveBeenCalledWith('✓ post types pushed')
    expect(logs.log).toHaveBeenCalledWith('\n→ composer: not configured, skipped')
    expect(logs.warn).not.toHaveBeenCalled()
  })

  it('says a dry run would push instead of claiming it pushed', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make({dryRun: true})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('✓ post types would push')
    expect(logs.log).not.toHaveBeenCalledWith('✓ post types pushed')
  })

  it('does not list the resources it skipped among those not attempted', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'))
    const {cmd} = make({argv: ['--skip', 'taxonomy']})

    await expect(cmd.run()).rejects.toThrow(/^post types failed to push: boom\. Not attempted: post meta, /)
  })

  it('warns with the held back resources before stopping on a failure under --skip-unsupported', async () => {
    mkdirSync(join(projectDir, 'snippets'), {recursive: true})
    vi.mocked(fakeOclifConfig.runCommand).mockRejectedValueOnce(new Error('boom'))
    const {cmd, logs} = make({argv: ['--skip-unsupported'], capabilities: makeCapabilities({integrations: {snippets: false}})})

    await expect(cmd.run()).rejects.toThrow('plugins failed to push: boom.')

    expect(logs.warn).toHaveBeenCalledWith(expect.stringMatching(/^Skipped with --skip-unsupported, this site can't hold them:\n {2}snippets: /))
  })

  it('words the closing line for a dry run, narrowed or not', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const full = make({dryRun: true})
    const narrowed = make({argv: ['--only', 'page'], dryRun: true})

    await full.cmd.run()
    await narrowed.cmd.run()

    expect(full.logs.log).toHaveBeenCalledWith('\nEvery resource would push.')
    expect(narrowed.logs.log).toHaveBeenCalledWith('\nEvery selected resource would push, the others are skipped.')
  })

  it('tells why each resource was skipped: not selected, or not used by the project', async () => {
    rmSync(join(projectDir, 'options'), {recursive: true})
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make({argv: ['--skip', 'taxonomy']})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('\n→ taxonomies: not selected, skipped')
    expect(logs.log).toHaveBeenCalledWith('\n→ options: not configured, skipped')
  })

  it('skips a Full-only resource the project does not use on Light, with the reason', async () => {
    for (const dir of ['acf', 'api', 'blocks', 'forms', 'hooks', 'pages', 'patterns', 'snippets', 'theme']) rmSync(join(projectDir, dir), {recursive: true})
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make({capabilities: makeLightCapabilities(), localConfig: {}})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith(expect.stringMatching(/^\n→ hooks: hooks need Loopress Full.*, skipped$/))
  })

  it('treats an unreadable composer.json as declaring no plugin', async () => {
    writeFileSync(join(projectDir, 'composer.json'), '{not json')
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make()

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('\n→ plugins: not configured, skipped')
  })

  it('puts each blocked resource on its own indented line', async () => {
    const {cmd} = make({capabilities: makeLightCapabilities()})

    await expect(cmd.run()).rejects.toThrow(/^Nothing was pushed, the project uses what this site can't hold:\n {2}plugins: .*\n {2}\S.*: .*Install Loopress Full/)
  })

  it('puts each resource held back by --skip-unsupported on its own indented line', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make({argv: ['--skip-unsupported'], capabilities: makeCapabilities({integrations: {acf: false, form: false}})})

    await cmd.run()

    expect(String(logs.warn.mock.calls[0]?.[0])).toMatch(/can't hold them:\n {2}\S.*\n {2}\S.*\nResources that depend on them/)
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
