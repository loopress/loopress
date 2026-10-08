import {select} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Switch from '../../../src/commands/project/switch.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv, makeListedProject} from '../../helpers/project-fixtures.js'

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

  it('auto-resolves without prompting when there is one project', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {production: makeEnv('production'), staging: makeEnv('staging')}, true),
    ])
    const setCurrent = vi.spyOn(configManager, 'setCurrent').mockImplementation(() => {})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(select).not.toHaveBeenCalled()
    expect(setCurrent).toHaveBeenCalledWith('id-acme')
    expect(log).toHaveBeenCalledWith('✓ Switched to "acme"')
  })

  it('prompts for a project only, defaulting to the active one', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {production: makeEnv('production')}, true),
      makeListedProject('id-beta', 'beta', {production: makeEnv('production'), staging: makeEnv('staging')}),
    ])
    const setCurrent = vi.spyOn(configManager, 'setCurrent').mockImplementation(() => {})
    vi.mocked(select).mockResolvedValueOnce('id-beta')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(select).toHaveBeenCalledTimes(1)
    const {choices, default: defaultValue} = vi.mocked(select).mock.calls[0][0] as unknown as {
      choices: Array<{name: string; value: string}>
      default: unknown
    }
    expect(choices).toEqual([
      {name: 'acme [current]', value: 'id-acme'},
      {name: 'beta', value: 'id-beta'},
    ])
    expect(defaultValue).toBe('id-acme')
    expect(setCurrent).toHaveBeenCalledWith('id-beta')
    expect(log).toHaveBeenCalledWith('✓ Switched to "beta"')
  })
})
