import {select} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Switch from '../../../src/commands/project/switch.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv, makeListedEnv, makeListedProject} from '../../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  Separator: class {
    type = 'separator'

    constructor(public separator: string) {}
  },
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

  it('prompts once across grouped projects/environments when there is more than one option', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {production: makeEnv('production')}, true),
      makeListedProject('id-beta', 'beta', {production: makeEnv('production'), staging: makeEnv('staging')}),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockImplementation((projectId) =>
      projectId === 'id-acme'
        ? [makeListedEnv('production', 'https://acme.com', true)]
        : [makeListedEnv('production', 'https://beta.com'), makeListedEnv('staging', 'https://staging.beta.com')],
    )
    const setCurrent = vi.spyOn(configManager, 'setCurrent').mockImplementation(() => {})
    vi.mocked(select).mockResolvedValueOnce('id-beta::staging')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(select).toHaveBeenCalledTimes(1)
    const {choices} = vi.mocked(select).mock.calls[0][0] as {choices: unknown[]}
    expect(choices.filter((choice) => (choice as {type?: string}).type === 'separator')).toHaveLength(2)
    expect(setCurrent).toHaveBeenCalledWith('id-beta', 'staging')
    expect(log).toHaveBeenCalledWith('✓ Switched to "beta/staging"')
  })

  it('defaults the prompt to the currently active project/environment', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {production: makeEnv('production')}, true),
      makeListedProject('id-beta', 'beta', {staging: makeEnv('staging')}),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockImplementation((projectId) =>
      projectId === 'id-acme'
        ? [makeListedEnv('production', 'https://acme.com', true)]
        : [makeListedEnv('staging', 'https://beta.com')],
    )
    vi.spyOn(configManager, 'setCurrent').mockImplementation(() => {})
    vi.mocked(select).mockResolvedValueOnce('id-beta::staging')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    const {default: defaultValue} = vi.mocked(select).mock.calls[0][0] as {default: unknown}
    expect(defaultValue).toBe('id-acme::production')
  })

  it('errors when no project has any environment configured', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([makeListedProject('id-acme', 'acme', {}, true)])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])

    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('No environments configured')
  })
})
