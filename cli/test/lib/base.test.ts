import {beforeEach, describe, expect, it, vi} from 'vitest'

import {configManager} from '../../src/config/project-config.manager.js'
import {LoopressCommand} from '../../src/lib/base.js'
import {EnvironmentConfig} from '../../src/types/config.js'
import {readLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

vi.mock('../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
}))

class TestCommand extends LoopressCommand {
  static flags = {
    ...LoopressCommand.baseFlags,
    ...LoopressCommand.dryRunFlag,
  }

  get resolvedDryRun(): boolean {
    return this.dryRun
  }

  get resolvedSiteConfig(): EnvironmentConfig {
    return this.siteConfig
  }

  async run(): Promise<void> {}
}

async function initWith(argv: string[]): Promise<TestCommand> {
  const cmd = new TestCommand(argv, fakeOclifConfig)
  await cmd.init()
  return cmd
}

describe('LoopressCommand.init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readLocalConfig).mockResolvedValue({})
  })

  it('builds siteConfig entirely from --url, --user and --password', async () => {
    const cmd = await initWith(['--url', 'https://flags.example.com/', '--user', 'admin', '--password', 'secret'])

    expect(cmd.resolvedSiteConfig.url).toBe('https://flags.example.com')
    expect(cmd.resolvedSiteConfig.token).toBe('admin:secret')
  })

  it('uses --url without credentials (token stays empty)', async () => {
    const cmd = await initWith(['--url', 'https://flags.example.com'])

    expect(cmd.resolvedSiteConfig.url).toBe('https://flags.example.com')
    expect(cmd.resolvedSiteConfig.token).toBeUndefined()
  })

  it('overrides only the token of the configured environment with --user/--password', async () => {
    vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production', 'https://acme.com', 'old:token'))

    const cmd = await initWith(['--user', 'admin', '--password', 'secret'])

    expect(cmd.resolvedSiteConfig.url).toBe('https://acme.com')
    expect(cmd.resolvedSiteConfig.token).toBe('admin:secret')
  })

  it('falls back to the configured environment when no flags are given', async () => {
    vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production', 'https://acme.com'))

    const cmd = await initWith([])

    expect(cmd.resolvedSiteConfig.url).toBe('https://acme.com')
    expect(cmd.resolvedSiteConfig.token).toBe('user:pass')
  })

  it('sets dryRun from the --dry-run flag', async () => {
    vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production'))

    const cmd = await initWith(['--dry-run'])
    expect(cmd.resolvedDryRun).toBe(true)

    const cmd2 = await initWith([])
    expect(cmd2.resolvedDryRun).toBe(false)
  })

  it('rejects a lone --user without --password', async () => {
    await expect(initWith(['--user', 'admin'])).rejects.toThrow('--user and --password must be provided together.')
  })

  it('rejects a lone --password without --user', async () => {
    await expect(initWith(['--password', 'secret'])).rejects.toThrow('--user and --password must be provided together.')
  })

  it('does not fall back to the global environment when loopress.json is broken', async () => {
    vi.mocked(readLocalConfig).mockRejectedValue(new Error('loopress.json is not valid JSON.'))
    const getCurrentEnv = vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production'))

    await expect(initWith([])).rejects.toThrow('loopress.json is not valid JSON.')
    expect(getCurrentEnv).not.toHaveBeenCalled()
  })
})
