import {confirm} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Sync from '../../../src/commands/project/sync.js'
import {authManager} from '../../../src/config/auth.manager.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {ApiClient} from '../../../src/lib/api-client.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv, makeListedEnv, makeListedProject} from '../../helpers/project-fixtures.js'

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

function make(): Sync {
  return new Sync([], fakeOclifConfig)
}

describe('project sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('creates the project and environment on the API when not yet synced, and persists the returned ids', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([makeListedProject('id-acme', 'acme', {}, true)])
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
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Synced 1 project, 1 environment'))
  })

  it('reuses existing api ids and only pushes credentials when already synced', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {...makeListedProject('id-acme', 'acme', {}, true), apiProjectId: 'api-project-1'},
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
      {...makeListedProject('id-acme', 'acme', {}, true), apiProjectId: 'api-project-1'},
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

  it('continues syncing other projects when one project fails to sync', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {}, true),
      makeListedProject('id-beta', 'beta', {}),
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])
    post.mockRejectedValueOnce(new Error('Free plan is limited to 3 projects.')).mockResolvedValueOnce({id: 'api-project-2'})
    const setProjectApiId = vi.spyOn(configManager, 'setProjectApiId').mockImplementation(() => {})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(setProjectApiId).not.toHaveBeenCalledWith('id-acme', expect.anything())
    expect(setProjectApiId).toHaveBeenCalledWith('id-beta', 'api-project-2')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Synced 1 project, 0 environments'))
  })

  it('does not push credentials when the environment has no token', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {...makeListedProject('id-acme', 'acme', {production: makeEnv('production')}, true), apiProjectId: 'api-project-1'},
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
    vi.spyOn(configManager, 'listProjects').mockReturnValue([makeListedProject('id-acme', 'Acme', {}, true)])
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
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Synced 1 project, 0 environments'))
  })

  it('creates a new project when the user declines linking to an existing match', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([makeListedProject('id-acme', 'Acme', {}, true)])
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
      {...makeListedProject('id-acme', 'Acme', {}, true), apiProjectId: 'api-project-1'},
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
    vi.spyOn(configManager, 'listProjects').mockReturnValue([makeListedProject('id-acme', 'acme', {}, true)])
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

  it('pulls down a project that exists on the API but not locally', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {...makeListedProject('id-acme', 'acme', {}, true), apiProjectId: 'api-project-1'},
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])
    get.mockResolvedValue([
      {environments: [], id: 'api-project-1', name: 'acme', slug: 'acme'},
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        environments: [
          {createdAt: '2026-01-01T00:00:00.000Z', id: 'api-env-9', name: 'production', url: 'https://beta.com'},
        ],
        id: 'api-project-9',
        name: 'beta',
        slug: 'beta',
      },
    ])
    const setProject = vi.spyOn(configManager, 'setProject').mockImplementation(() => {})
    const createProjectId = vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(createProjectId).toHaveBeenCalled()
    expect(setProject).toHaveBeenCalledWith('new-id', {
      addedAt: '2026-01-01T00:00:00.000Z',
      apiProjectId: 'api-project-9',
      environments: {
        production: {
          addedAt: '2026-01-01T00:00:00.000Z',
          apiEnvironmentId: 'api-env-9',
          name: 'production',
          url: 'https://beta.com',
        },
      },
      name: 'beta',
    })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Synced 2 projects, 1 environment'))
  })
})
