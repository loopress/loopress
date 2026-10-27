import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../src/commands/pull.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
import {makeCapabilities, makeLightCapabilities, stubCapabilities} from '../helpers/capabilities.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

const ALL_COMMAND_IDS = [
  'composer:pull',
  'plugin:pull',
  'cpt:pull',
  'taxonomy:pull',
  'meta:pull',
  'role:pull',
  'acf:pull',
  'api:pull',
  'hook:pull',
  'block:pull',
  'form:pull',
  'pattern:pull',
  'menu:pull',
  'option:pull',
  'snippet:pull',
]

// The commands that delete orphaned local files and so accept --yes.
const SUPPORTS_YES = new Set(['acf:pull', 'api:pull', 'block:pull', 'cpt:pull', 'form:pull', 'hook:pull', 'menu:pull', 'meta:pull', 'option:pull', 'pattern:pull', 'role:pull', 'snippet:pull', 'taxonomy:pull'])

class TestPull extends Pull {
  setup(options: {dryRun?: boolean | undefined; siteConfig: EnvironmentConfig; yes?: boolean | undefined}) {
    this.dryRun = options.dryRun ?? false
    this.yes = options.yes ?? false
    this.siteConfig = options.siteConfig
    this.localConfig = {}
  }
}

function make(options: {capabilities?: ReturnType<typeof makeCapabilities>; dryRun?: boolean; siteConfig?: EnvironmentConfig; yes?: boolean} = {}) {
  const cmd = new TestPull([], fakeOclifConfig)
  stubCapabilities(cmd, options.capabilities ?? makeCapabilities())
  cmd.setup({
    dryRun: options.dryRun,
    siteConfig: options.siteConfig ?? makeEnv('staging', 'https://staging.acme.com'),
    yes: options.yes,
  })
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('pull', () => {
  beforeEach(() => {
    resetFakeOclifConfig()
    vi.clearAllMocks()
  })

  it('delegates to every resource pull, composer before plugins, with the resolved env', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({siteConfig: makeEnv('staging', 'https://staging.acme.com')})

    await cmd.run()

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(ALL_COMMAND_IDS.length)
    for (const [index, commandId] of ALL_COMMAND_IDS.entries()) {
      expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(index + 1, commandId, ['--env', 'staging'])
    }
  })

  it('forwards --dry-run to every delegated pull', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({dryRun: true})

    await cmd.run()

    for (const commandId of ALL_COMMAND_IDS) {
      expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith(commandId, ['--env', 'staging', '--dry-run'])
    }
  })

  it('forwards --yes only to the pulls that delete orphaned files', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({yes: true})

    await cmd.run()

    for (const commandId of ALL_COMMAND_IDS) {
      const expected = SUPPORTS_YES.has(commandId) ? ['--env', 'staging', '--yes'] : ['--env', 'staging']
      expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith(commandId, expected)
    }
  })

  it('does not forward --yes when the user did not pass it', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make()

    await cmd.run()

    for (const commandId of ALL_COMMAND_IDS) {
      expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith(commandId, ['--env', 'staging'])
    }
  })

  it('reports success once every resource pulled', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make()

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('\nAll resources pulled.')
  })

  it('returns a per-resource result for --json, so pull_all in the MCP server has something to parse', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make()

    const result = await cmd.run()

    expect(result.results).toHaveLength(ALL_COMMAND_IDS.length + 1)
    // This project tracks no Global Styles.
    expect(result.results.filter((entry) => entry.status !== 'pulled')).toEqual([{label: 'Global Styles', status: 'skipped'}])
  })

  describe('Global Styles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-pull-test-'))
      mkdirSync(join(dir, 'theme'))
      writeFileSync(join(dir, 'theme', 'bakery-global-styles.json'), '{}')
      vi.spyOn(process, 'cwd').mockReturnValue(dir)
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    })

    afterEach(() => {
      vi.mocked(process.cwd).mockRestore()
      rmSync(dir, {force: true, recursive: true})
    })

    function withActiveTheme(theme: Record<string, unknown>) {
      const made = make()
      ;(made.cmd as unknown as {wpClient: unknown}).wpClient = {get: vi.fn(async () => [{status: 'active', ...theme}])}
      return made
    }

    it('pulls them once the project tracks them, on a block theme', async () => {
      await withActiveTheme({stylesheet: 'twentytwentyfive', theme_supports: {'block-templates': true}}).cmd.run()

      expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('theme:style:pull', ['--env', 'staging'])
    })

    it('skips them on a classic theme instead of failing the run', async () => {
      const {cmd, logs} = withActiveTheme({stylesheet: 'storefront', theme_supports: {}})

      const result = await cmd.run()

      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalledWith('theme:style:pull', expect.anything())
      expect(logs.log).toHaveBeenCalledWith('\n→ Global Styles: the active theme "storefront" is a classic theme, skipped')
      expect(result.results).toContainEqual({label: 'Global Styles', status: 'skipped'})
    })
  })

  it('continues past a failed resource and still pulls the rest', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockRejectedValueOnce(new Error('boom')).mockResolvedValue({})
    const {cmd, logs} = make()

    await expect(cmd.run()).rejects.toThrow('1 resource failed to pull.')

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(ALL_COMMAND_IDS.length)
    expect(logs.log).toHaveBeenCalledWith('✗ composer failed: boom')
    expect(logs.log).toHaveBeenCalledWith('✓ plugins pulled')
  })

  it('skips, without asking the site, a resource whose plugin it lacks when the project does not use it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lps-pull-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make({capabilities: makeCapabilities({integrations: {acf: false}})})

    const result = await cmd.run()

    expect(fakeOclifConfig.runCommand).not.toHaveBeenCalledWith('acf:pull', expect.anything())
    expect(result.results).toContainEqual({label: 'ACF', status: 'skipped'})
    expect(logs.log).toHaveBeenCalledWith('\n→ ACF: not configured, skipped')
    vi.mocked(process.cwd).mockRestore()
    rmSync(dir, {force: true, recursive: true})
  })

  it('fails, without asking the site, a resource whose plugin it lacks when the project uses it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lps-pull-test-'))
    mkdirSync(join(dir, 'snippets'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({capabilities: makeCapabilities({integrations: {snippets: false}})})

    await expect(cmd.run()).rejects.toThrow('1 resource failed to pull. snippets: no supported snippet plugin is active on staging')
    expect(fakeOclifConfig.runCommand).not.toHaveBeenCalledWith('snippet:pull', expect.anything())
    vi.mocked(process.cwd).mockRestore()
    rmSync(dir, {force: true, recursive: true})
  })

  it('skips the Full-only resources and Composer on Light when the project does not use them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lps-pull-test-'))
    writeFileSync(join(dir, 'composer.json'), '{}')
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make({capabilities: makeLightCapabilities()})

    await cmd.run()

    for (const commandId of ['composer:pull', 'api:pull', 'hook:pull', 'pattern:pull', 'snippet:pull']) {
      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalledWith(commandId, expect.anything())
    }

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('menu:pull', ['--env', 'staging'])
    expect(logs.log).toHaveBeenCalledWith('\n→ composer: Composer files need Loopress Full, skipped')
    expect(logs.log).toHaveBeenCalledWith('\n→ API routes: API routes need Loopress Full, skipped')
    vi.mocked(process.cwd).mockRestore()
    rmSync(dir, {force: true, recursive: true})
  })

  it('fails a Full-only resource on Light when the project uses it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lps-pull-test-'))
    mkdirSync(join(dir, 'hooks'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({capabilities: makeLightCapabilities()})

    await expect(cmd.run()).rejects.toThrow('1 resource failed to pull. hooks: hooks need Loopress Full on staging')
    vi.mocked(process.cwd).mockRestore()
    rmSync(dir, {force: true, recursive: true})
  })

  it('reports the plural count when multiple resources fail', async () => {
    vi.mocked(fakeOclifConfig.runCommand)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('bang'))
      .mockResolvedValue({})
    const {cmd} = make()

    await expect(cmd.run()).rejects.toThrow('2 resources failed to pull.')
  })
})
