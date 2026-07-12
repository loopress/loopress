import {confirm} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/project/push.js'
import {authManager} from '../../../src/config/auth.manager.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {ApiClient} from '../../../src/lib/api-client.js'
import {listrInstances, outputsOf, resetListrInstances, titlesOf} from '../../helpers/listr.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeListedEnv, makeListedProject} from '../../helpers/project-fixtures.js'

const {get, post, put} = vi.hoisted(() => ({get: vi.fn(), post: vi.fn(), put: vi.fn()}))

vi.mock('../../../src/lib/api-client.js', () => ({
  ApiClient: vi.fn().mockImplementation(function (this: {get: typeof get; post: typeof post; put: typeof put}) {
    this.get = get
    this.post = post
    this.put = put
  }),
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

vi.mock('listr2', async () => {
  const {createListrMock} = await import('../../helpers/listr.js')
  return createListrMock()
})

function make(): Push {
  return new Push([], fakeOclifConfig)
}

// push.ts never reads `project.environments` directly, it calls the separately mocked
// `configManager.listEnvironments(project.id)` instead, so these local wrappers hardcode
// it to `{}` rather than making every call site pass an argument that has no effect.
function project(id: string, name: string, isCurrent = false) {
  return makeListedProject(id, name, {}, isCurrent)
}

function linkedProject(id: string, name: string, apiProjectId: string, isCurrent = false) {
  return {...project(id, name, isCurrent), apiProjectId}
}

describe('project push', () => {
  beforeEach(() => {
    resetListrInstances()
    vi.mocked(ApiClient).mockClear()
    get.mockReset().mockResolvedValue([])
    post.mockReset()
    put.mockReset()
    vi.mocked(confirm).mockReset()
    vi.spyOn(authManager, 'getAuth').mockReturnValue({email: 'a@b.com', savedAt: '2024-01-01', token: 'jwt-token'})
  })

  it('errors when not logged in', async () => {
    vi.spyOn(authManager, 'getAuth').mockReturnValue(null)
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('Not logged in')
    expect(ApiClient).not.toHaveBeenCalled()
  })

  it('logs and returns when no projects are configured', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    const cmd = make()
    const {log} = silenceLogs(cmd)

    await cmd.run()

    expect(log).toHaveBeenCalledWith('No projects configured. Run `lps project config` first.')
    expect(ApiClient).not.toHaveBeenCalled()
  })

  it('creates the project and environment on the API when not yet pushed, and persists the returned ids', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([project('id-acme', 'acme', true)])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {...makeListedEnv('production', 'https://acme.com'), token: 'admin:app-pass'},
    ])
    post.mockResolvedValueOnce({id: 'api-project-1'}).mockResolvedValueOnce({id: 'api-env-1'})
    put.mockResolvedValueOnce()
    const setProjectApiId = vi.spyOn(configManager, 'setProjectApiId').mockImplementation(() => {})
    const setEnvironmentApiId = vi.spyOn(configManager, 'setEnvironmentApiId').mockImplementation(() => {})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(post).toHaveBeenNthCalledWith(1, 'projects', {name: 'acme'})
    expect(post).toHaveBeenNthCalledWith(2, 'projects/api-project-1/environments', {
      name: 'production',
      url: 'https://acme.com',
    })
    expect(put).toHaveBeenCalledWith('projects/api-project-1/environments/api-env-1/credentials', {
      password: 'app-pass',
      username: 'admin',
    })
    expect(setProjectApiId).toHaveBeenCalledWith('id-acme', 'api-project-1')
    expect(setEnvironmentApiId).toHaveBeenCalledWith('id-acme', 'production', 'api-env-1')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pushed 1 project, 1 environment'))
  })

  it('reuses existing api ids and only pushes credentials when already pushed', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {...makeListedEnv('production', 'https://acme.com'), apiEnvironmentId: 'api-env-1', token: 'admin:pass'},
    ])

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(post).not.toHaveBeenCalled()
    expect(put).toHaveBeenCalledWith('projects/api-project-1/environments/api-env-1/credentials', {
      password: 'pass',
      username: 'admin',
    })
  })

  it('splits a password containing colons on the first colon only', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {...makeListedEnv('production', 'https://acme.com'), apiEnvironmentId: 'api-env-1', token: 'admin:xxxx:yyyy:zzzz'},
    ])

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(put).toHaveBeenCalledWith('projects/api-project-1/environments/api-env-1/credentials', {
      password: 'xxxx:yyyy:zzzz',
      username: 'admin',
    })
  })

  it('continues pushing other projects when one project fails to push', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      project('id-acme', 'acme', true),
      project('id-beta', 'beta'),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])
    post.mockRejectedValueOnce(new Error('Free plan is limited to 3 projects.')).mockResolvedValueOnce({id: 'api-project-2'})
    const setProjectApiId = vi.spyOn(configManager, 'setProjectApiId').mockImplementation(() => {})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(setProjectApiId).not.toHaveBeenCalledWith('id-acme', expect.anything())
    expect(setProjectApiId).toHaveBeenCalledWith('id-beta', 'api-project-2')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pushed 1 project, 0 environments'))
  })

  it('does not push credentials when the environment has no token', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {...makeListedEnv('production', 'https://acme.com'), apiEnvironmentId: 'api-env-1', token: undefined},
    ])

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(put).not.toHaveBeenCalled()
  })

  it('offers to link when a project with the same slug already exists on the API, and links when confirmed', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([project('id-acme', 'Acme', true)])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])
    get.mockResolvedValue([{environments: [], id: 'api-project-1', name: 'Acme', slug: 'acme'}])
    vi.mocked(confirm).mockResolvedValueOnce(true)
    const setProjectApiId = vi.spyOn(configManager, 'setProjectApiId').mockImplementation(() => {})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('A project named "Acme" already exists')}),
    )
    expect(post).not.toHaveBeenCalledWith('projects', expect.anything())
    expect(setProjectApiId).toHaveBeenCalledWith('id-acme', 'api-project-1')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pushed 1 project, 0 environments'))
  })

  it('creates a new project when the user declines linking to an existing match', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([project('id-acme', 'Acme', true)])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])
    get.mockResolvedValue([{environments: [], id: 'api-project-1', name: 'Acme', slug: 'acme'}])
    vi.mocked(confirm).mockResolvedValueOnce(false)
    post.mockResolvedValueOnce({id: 'api-project-2'})
    const setProjectApiId = vi.spyOn(configManager, 'setProjectApiId').mockImplementation(() => {})

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(post).toHaveBeenCalledWith('projects', {name: 'Acme'})
    expect(setProjectApiId).toHaveBeenCalledWith('id-acme', 'api-project-2')
  })

  it('links a local environment to an existing API environment when confirmed, skipping creation', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'Acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {...makeListedEnv('production', 'https://acme.com'), token: 'admin:pass'},
    ])
    get.mockResolvedValue([
      {environments: [{id: 'api-env-1', name: 'production'}], id: 'api-project-1', name: 'Acme', slug: 'acme'},
    ])
    vi.mocked(confirm).mockResolvedValueOnce(true)
    const setEnvironmentApiId = vi.spyOn(configManager, 'setEnvironmentApiId').mockImplementation(() => {})

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(post).not.toHaveBeenCalled()
    expect(setEnvironmentApiId).toHaveBeenCalledWith('id-acme', 'production', 'api-env-1')
    expect(put).toHaveBeenCalledWith('projects/api-project-1/environments/api-env-1/credentials', {
      password: 'pass',
      username: 'admin',
    })
  })

  it('falls back to an empty list and warns when fetching existing projects fails', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([project('id-acme', 'acme', true)])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])
    get.mockRejectedValueOnce(new Error('network down'))
    post.mockResolvedValueOnce({id: 'api-project-1'})
    vi.spyOn(configManager, 'setProjectApiId').mockImplementation(() => {})

    const cmd = make()
    const {warn} = silenceLogs(cmd)
    await cmd.run()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not fetch existing projects'))
    expect(post).toHaveBeenCalledWith('projects', {name: 'acme'})
  })

  it('titles and reports the project Listr task as "Create" when creating, and "Created on the API" once applied', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([project('id-acme', 'acme', true)])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])
    post.mockResolvedValueOnce({id: 'api-project-1'})
    vi.spyOn(configManager, 'setProjectApiId').mockImplementation(() => {})

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(titlesOf(0)).toEqual(['Create project "acme" on the API'])
    expect(outputsOf(0)).toEqual(['Created on the API'])
  })

  it('titles and reports the project Listr task as "Link" when linking to an existing match', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([project('id-acme', 'Acme', true)])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])
    get.mockResolvedValue([{environments: [], id: 'api-project-1', name: 'Acme', slug: 'acme'}])
    vi.mocked(confirm).mockResolvedValueOnce(true)
    vi.spyOn(configManager, 'setProjectApiId').mockImplementation(() => {})

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(titlesOf(0)).toEqual(['Link project "Acme" to the API'])
    expect(outputsOf(0)).toEqual(['Linked to the API'])
  })

  it('declines linking an environment to an existing match and creates a new one instead', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'Acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {...makeListedEnv('production', 'https://acme.com'), token: 'admin:pass'},
    ])
    get.mockResolvedValue([
      {environments: [{id: 'api-env-1', name: 'production'}], id: 'api-project-1', name: 'Acme', slug: 'acme'},
    ])
    vi.mocked(confirm).mockResolvedValueOnce(false)
    post.mockResolvedValueOnce({id: 'api-env-2'})
    const setEnvironmentApiId = vi.spyOn(configManager, 'setEnvironmentApiId').mockImplementation(() => {})

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(post).toHaveBeenCalledWith('projects/api-project-1/environments', {
      name: 'production',
      url: 'https://acme.com',
    })
    expect(setEnvironmentApiId).toHaveBeenCalledWith('id-acme', 'production', 'api-env-2')
  })

  it('titles and reports the environment Listr task as "Create" when creating, and "Created on the API" once applied', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([makeListedEnv('production', 'https://acme.com')])
    post.mockResolvedValueOnce({id: 'api-env-1'})
    vi.spyOn(configManager, 'setEnvironmentApiId').mockImplementation(() => {})

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(titlesOf(0)).toEqual(['Create environment "production" on "acme"'])
    expect(outputsOf(0)).toEqual(['Created on the API'])
  })

  it('titles and reports the environment Listr task as "Link" when linking to an existing match', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'Acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([makeListedEnv('production', 'https://acme.com')])
    get.mockResolvedValue([
      {environments: [{id: 'api-env-1', name: 'production'}], id: 'api-project-1', name: 'Acme', slug: 'acme'},
    ])
    vi.mocked(confirm).mockResolvedValueOnce(true)
    vi.spyOn(configManager, 'setEnvironmentApiId').mockImplementation(() => {})

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(titlesOf(0)).toEqual(['Link environment "production" on "Acme"'])
    expect(outputsOf(0)).toEqual(['Linked to the API'])
  })

  it('pushes multiple projects and environments needing work, pluralizing the summary correctly', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      project('id-acme', 'acme', true),
      project('id-beta', 'beta'),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockImplementation((projectId: string) =>
      projectId === 'id-acme'
        ? [{...makeListedEnv('production', 'https://acme.com'), token: 'admin:pass'}]
        : [{...makeListedEnv('staging', 'https://beta.com'), token: 'admin:pass'}],
    )
    post
      .mockResolvedValueOnce({id: 'api-project-1'})
      .mockResolvedValueOnce({id: 'api-env-1'})
      .mockResolvedValueOnce({id: 'api-project-2'})
      .mockResolvedValueOnce({id: 'api-env-2'})
    vi.spyOn(configManager, 'setProjectApiId').mockImplementation(() => {})
    vi.spyOn(configManager, 'setEnvironmentApiId').mockImplementation(() => {})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pushed 2 projects, 2 environments'))
  })

  it('continues applying other environments when one environment fails to push, and reports the failure output', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      makeListedEnv('production', 'https://acme.com'),
      makeListedEnv('staging', 'https://staging.acme.com'),
    ])
    post.mockRejectedValueOnce(new Error('quota exceeded')).mockResolvedValueOnce({id: 'api-env-2'})
    const setEnvironmentApiId = vi.spyOn(configManager, 'setEnvironmentApiId').mockImplementation(() => {})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(setEnvironmentApiId).toHaveBeenCalledTimes(1)
    expect(setEnvironmentApiId).toHaveBeenCalledWith('id-acme', 'staging', 'api-env-2')
    expect(outputsOf(0)).toEqual(['Failed to push "production": quota exceeded', 'Created on the API'])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pushed 1 project, 1 environment'))
  })

  it('warns with the project and environment name when pushing credentials fails', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {...makeListedEnv('production', 'https://acme.com'), apiEnvironmentId: 'api-env-1', token: 'admin:pass'},
    ])
    put.mockRejectedValueOnce(new Error('invalid credentials'))

    const cmd = make()
    const {warn} = silenceLogs(cmd)
    await cmd.run()

    expect(warn).toHaveBeenCalledWith('Failed to push "acme/production": invalid credentials')
  })

  it('does not construct a project or environment Listr when everything is already pushed', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      linkedProject('id-acme', 'acme', 'api-project-1', true),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {...makeListedEnv('production', 'https://acme.com'), apiEnvironmentId: 'api-env-1', token: undefined},
    ])

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(listrInstances).toHaveLength(0)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pushed 1 project, 1 environment'))
  })
})
