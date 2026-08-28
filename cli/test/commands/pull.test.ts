import {beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../src/commands/pull.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

const ALL_COMMAND_IDS = [
  'composer:pull',
  'plugin:pull',
  'acf:pull',
  'api:pull',
  'form:pull',
  'page:pull',
  'seo:pull',
  'snippet:pull',
]

// The commands that delete orphaned local files and so accept --yes.
const SUPPORTS_YES = new Set(['acf:pull', 'api:pull', 'form:pull', 'page:pull', 'seo:pull', 'snippet:pull'])

class TestPull extends Pull {
  setup(options: {dryRun?: boolean; siteConfig: EnvironmentConfig; yes?: boolean}) {
    this.dryRun = options.dryRun ?? false
    this.yes = options.yes ?? false
    this.siteConfig = options.siteConfig
    this.localConfig = {}
  }
}

function make(options: {dryRun?: boolean; siteConfig?: EnvironmentConfig; yes?: boolean} = {}) {
  const cmd = new TestPull([], fakeOclifConfig)
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

  it('continues past a failed resource and still pulls the rest', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockRejectedValueOnce(new Error('boom')).mockResolvedValue({})
    const {cmd, logs} = make()

    await expect(cmd.run()).rejects.toThrow('1 resource failed to pull.')

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(ALL_COMMAND_IDS.length)
    expect(logs.log).toHaveBeenCalledWith('✗ composer failed: boom')
    expect(logs.log).toHaveBeenCalledWith('✓ plugins pulled')
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
