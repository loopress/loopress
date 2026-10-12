import {confirm} from '@inquirer/prompts'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../src/commands/push.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
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
  'page:push',
  'menu:push',
  'option:push',
  'snippet:push',
]

class TestPush extends Push {
  setup(options: {dryRun?: boolean; overwrite?: boolean; siteConfig: EnvironmentConfig; yes?: boolean}) {
    this.dryRun = options.dryRun ?? false
    this.overwrite = options.overwrite ?? false
    this.yes = options.yes ?? false
    this.siteConfig = options.siteConfig
    this.localConfig = {}
  }
}

function make(options: {dryRun?: boolean; overwrite?: boolean; siteConfig?: EnvironmentConfig; yes?: boolean} = {}) {
  const cmd = new TestPush([], fakeOclifConfig)
  cmd.setup({
    dryRun: options.dryRun,
    overwrite: options.overwrite,
    siteConfig: options.siteConfig ?? makeEnv('staging', 'https://staging.acme.com'),
    yes: options.yes,
  })
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('push', () => {
  beforeEach(() => {
    resetFakeOclifConfig()
    vi.clearAllMocks()
    interactive.value = false
  })

  it('skips composer:push when plugin:push already pushes a composer.json that declares plugins', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lps-push-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/akismet': '5.3.3'}}))
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make()

    try {
      await cmd.run()
    } finally {
      vi.mocked(process.cwd).mockRestore()
      rmSync(dir, {force: true, recursive: true})
    }

    const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
    expect(ran).toEqual(ALL_COMMAND_IDS.filter((id) => id !== 'composer:push'))
    expect(logs.log).toHaveBeenCalledWith('\n→ composer: already pushed whole by plugins')
  })

  it('delegates to every resource push, in dependency order, with the resolved env and --yes', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make({siteConfig: makeEnv('staging', 'https://staging.acme.com')})

    await cmd.run()

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(ALL_COMMAND_IDS.length)
    for (const [index, commandId] of ALL_COMMAND_IDS.entries()) {
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
    expect(result.results.every((entry) => entry.status === 'pushed')).toBe(true)
  })

  it('stops at the first failed resource and names the ones not attempted', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'))
    const {cmd, logs} = make()

    await expect(cmd.run()).rejects.toThrow('composer failed to push: boom. Not attempted: post types, taxonomies,')

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(2)
    expect(logs.log).toHaveBeenCalledWith('✗ composer failed: boom')
  })

  it('names nothing as skipped when the last resource fails', async () => {
    const calls = vi.mocked(fakeOclifConfig.runCommand)
    for (let i = 0; i < ALL_COMMAND_IDS.length - 1; i++) calls.mockResolvedValueOnce({})
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
