import {checkbox} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Remove from '../../../src/commands/project/remove.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv, makeListedEnv, makeListedProject} from '../../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn(),
}))

function make(): Remove {
  return new Remove([], fakeOclifConfig)
}

// Choice order produced by remove.ts: for each project (in listProjects order), the
// project itself, then each of its environments (in listEnvironments order).
// acme: index 0 = project, 1 = production, 2 = staging
// beta: index 3 = project, 4 = production
function setUpTwoProjects() {
  vi.spyOn(configManager, 'listProjects').mockReturnValue([
    makeListedProject('id-acme', 'acme', {production: makeEnv('production'), staging: makeEnv('staging')}, true),
    makeListedProject('id-beta', 'beta', {production: makeEnv('production')}),
  ])
  vi.spyOn(configManager, 'listEnvironments').mockImplementation((projectId: string) =>
    projectId === 'id-acme'
      ? [makeListedEnv('production', 'https://acme.com', true), makeListedEnv('staging', 'https://staging.acme.com')]
      : [makeListedEnv('production', 'https://beta.com')],
  )
}

describe('project remove', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('errors when no projects are configured', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('No projects configured')
  })

  it('logs "Nothing removed." when the selection is empty', async () => {
    setUpTwoProjects()
    const removeProject = vi.spyOn(configManager, 'removeProject').mockImplementation(() => {})
    const removeEnvironment = vi.spyOn(configManager, 'removeEnvironment').mockImplementation(() => {})
    vi.mocked(checkbox).mockResolvedValue([])

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith('Nothing removed.')
    expect(removeProject).not.toHaveBeenCalled()
    expect(removeEnvironment).not.toHaveBeenCalled()
  })

  it('removes a whole project when its top-level entry is selected', async () => {
    setUpTwoProjects()
    const removeProject = vi.spyOn(configManager, 'removeProject').mockImplementation(() => {})
    const removeEnvironment = vi.spyOn(configManager, 'removeEnvironment').mockImplementation(() => {})
    vi.mocked(checkbox).mockResolvedValue(['0'])

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(removeProject).toHaveBeenCalledWith('id-acme')
    expect(removeEnvironment).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('✓ Removed: acme')
  })

  it('removes only the selected environments when the parent project is not selected', async () => {
    setUpTwoProjects()
    const removeProject = vi.spyOn(configManager, 'removeProject').mockImplementation(() => {})
    const removeEnvironment = vi.spyOn(configManager, 'removeEnvironment').mockImplementation(() => {})
    vi.mocked(checkbox).mockResolvedValue(['2'])

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(removeProject).not.toHaveBeenCalled()
    expect(removeEnvironment).toHaveBeenCalledWith('id-acme', 'staging')
    expect(log).toHaveBeenCalledWith('✓ Removed: acme/staging')
  })

  it('ignores an env selection when its parent project is also selected', async () => {
    setUpTwoProjects()
    const removeProject = vi.spyOn(configManager, 'removeProject').mockImplementation(() => {})
    const removeEnvironment = vi.spyOn(configManager, 'removeEnvironment').mockImplementation(() => {})
    vi.mocked(checkbox).mockResolvedValue(['0', '1'])

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(removeProject).toHaveBeenCalledWith('id-acme')
    expect(removeEnvironment).not.toHaveBeenCalled()
  })

  it('handles a mixed selection of a whole project and an environment from another', async () => {
    setUpTwoProjects()
    const removeProject = vi.spyOn(configManager, 'removeProject').mockImplementation(() => {})
    const removeEnvironment = vi.spyOn(configManager, 'removeEnvironment').mockImplementation(() => {})
    vi.mocked(checkbox).mockResolvedValue(['0', '4'])

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(removeProject).toHaveBeenCalledWith('id-acme')
    expect(removeEnvironment).toHaveBeenCalledWith('id-beta', 'production')
    expect(log).toHaveBeenCalledWith('✓ Removed: acme, beta/production')
  })
})
