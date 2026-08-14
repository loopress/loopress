import {confirm} from '@inquirer/prompts'
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
  'acf:push',
  'api:push',
  'form:push',
  'page:push',
  'seo:push',
  'snippet:push',
]

class TestPush extends Push {
  setup(options: {dryRun?: boolean; siteConfig: EnvironmentConfig; yes?: boolean}) {
    this.dryRun = options.dryRun ?? false
    this.yes = options.yes ?? false
    this.siteConfig = options.siteConfig
    this.localConfig = {}
  }
}

function make(options: {dryRun?: boolean; siteConfig?: EnvironmentConfig; yes?: boolean} = {}) {
  const cmd = new TestPush([], fakeOclifConfig)
  cmd.setup({dryRun: options.dryRun, siteConfig: options.siteConfig ?? makeEnv('staging', 'https://staging.acme.com'), yes: options.yes})
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('push', () => {
  beforeEach(() => {
    resetFakeOclifConfig()
    vi.clearAllMocks()
    interactive.value = false
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

  it('reports success once every resource pushed', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd, logs} = make()

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('\nAll resources pushed.')
  })

  it('continues past a failed resource and still pushes the rest', async () => {
    vi.mocked(fakeOclifConfig.runCommand)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({})
    const {cmd, logs} = make()

    await expect(cmd.run()).rejects.toThrow('1 resource failed to push.')

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(ALL_COMMAND_IDS.length)
    expect(logs.log).toHaveBeenCalledWith('✗ plugins failed: boom')
    expect(logs.log).toHaveBeenCalledWith('✓ composer pushed')
  })

  it('reports the plural count when multiple resources fail', async () => {
    vi.mocked(fakeOclifConfig.runCommand)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('bang'))
      .mockResolvedValue({})
    const {cmd} = make()

    await expect(cmd.run()).rejects.toThrow('2 resources failed to push.')
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
