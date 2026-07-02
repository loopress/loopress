import {select} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Switch from '../../../src/commands/project/switch.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv, makeListedEnv, makeListedProject} from '../../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
}))

function make(): Switch {
  return new Switch([], fakeOclifConfig)
}

describe('project switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('errors when no projects are configured', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('No projects configured')
  })

  it('auto-resolves without prompting when there is one project and one environment', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {production: makeEnv('production')}, true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([makeListedEnv('production', 'https://acme.com', true)])
    const setCurrent = vi.spyOn(configManager, 'setCurrent').mockImplementation(() => {})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(select).not.toHaveBeenCalled()
    expect(setCurrent).toHaveBeenCalledWith('id-acme', 'production')
    expect(log).toHaveBeenCalledWith('✓ Switched to "acme/production"')
  })

  it('prompts for an environment when the single project has more than one', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {production: makeEnv('production'), staging: makeEnv('staging')}, true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      makeListedEnv('production', 'https://acme.com', true),
      makeListedEnv('staging', 'https://staging.acme.com'),
    ])
    const setCurrent = vi.spyOn(configManager, 'setCurrent').mockImplementation(() => {})
    vi.mocked(select).mockResolvedValueOnce('staging')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(select).toHaveBeenCalledTimes(1)
    expect(setCurrent).toHaveBeenCalledWith('id-acme', 'staging')
    expect(log).toHaveBeenCalledWith('✓ Switched to "acme/staging"')
  })

  it('prompts for a project, then auto-resolves its single environment', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {production: makeEnv('production')}, true),
      makeListedProject('id-beta', 'beta', {staging: makeEnv('staging')}),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([makeListedEnv('staging', 'https://beta.com')])
    const setCurrent = vi.spyOn(configManager, 'setCurrent').mockImplementation(() => {})
    vi.mocked(select).mockResolvedValueOnce('id-beta')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(select).toHaveBeenCalledTimes(1)
    expect(setCurrent).toHaveBeenCalledWith('id-beta', 'staging')
    expect(log).toHaveBeenCalledWith('✓ Switched to "beta/staging"')
  })

  it('prompts for both project and environment when both have multiple options', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {production: makeEnv('production')}, true),
      makeListedProject('id-beta', 'beta', {production: makeEnv('production'), staging: makeEnv('staging')}),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      makeListedEnv('production', 'https://beta.com'),
      makeListedEnv('staging', 'https://staging.beta.com'),
    ])
    const setCurrent = vi.spyOn(configManager, 'setCurrent').mockImplementation(() => {})
    vi.mocked(select).mockResolvedValueOnce('id-beta').mockResolvedValueOnce('staging')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(select).toHaveBeenCalledTimes(2)
    expect(setCurrent).toHaveBeenCalledWith('id-beta', 'staging')
  })

  it('errors when the resolved project has no environments', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([makeListedProject('id-acme', 'acme', {}, true)])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])

    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('No environments configured for "acme"')
  })
})
