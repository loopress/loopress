import {beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/project/pull.js'
import {authManager} from '../../../src/config/auth.manager.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {ApiClient} from '../../../src/lib/api-client.js'
import {outputsOf, resetListrInstances, titlesOf} from '../../helpers/listr.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeListedProject} from '../../helpers/project-fixtures.js'

const {get} = vi.hoisted(() => ({get: vi.fn()}))

vi.mock('../../../src/lib/api-client.js', () => ({
  ApiClient: vi.fn().mockImplementation(function (this: {get: typeof get}) {
    this.get = get
  }),
}))

vi.mock('listr2', async () => {
  const {createListrMock} = await import('../../helpers/listr.js')
  return createListrMock()
})

function make(): Pull {
  return new Pull([], fakeOclifConfig)
}

function linkedProject(id: string, name: string, apiProjectId: string, isCurrent = false) {
  return {...makeListedProject(id, name, {}, isCurrent), apiProjectId}
}

describe('project pull', () => {
  beforeEach(() => {
    resetListrInstances()
    vi.mocked(ApiClient).mockClear()
    get.mockReset().mockResolvedValue([])
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.spyOn(authManager, 'getAuth').mockReturnValue({email: 'a@b.com', savedAt: '2024-01-01', token: 'jwt-token'})
  })

  it('errors when not logged in', async () => {
    vi.spyOn(authManager, 'getAuth').mockReturnValue(null)
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('Not logged in')
    expect(ApiClient).not.toHaveBeenCalled()
  })

  it('errors when fetching projects from the API fails', async () => {
    get.mockRejectedValueOnce(new Error('network down'))
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('Could not fetch projects from the API: network down')
  })

  it('pulls down a project that exists on the API but not locally', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([linkedProject('id-acme', 'acme', 'api-project-1', true)])
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

    expect(createProjectId).toHaveBeenCalledWith('beta')
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
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pulled 1 project, 1 environment'))
  })

  it('reuses a local project already linked to the same API project instead of creating a duplicate', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([linkedProject('id-acme', 'acme', 'api-project-1', true)])
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
    // Simulates a local project whose link to api-project-9 was lost from `listProjects()`'s
    // view (e.g. a partially corrupted config), but is still discoverable by api id.
    vi.spyOn(configManager, 'findProjectByApiId').mockReturnValue({
      addedAt: '2025-06-01T00:00:00.000Z',
      apiProjectId: 'api-project-9',
      environments: {},
      id: 'id-beta-existing',
      name: 'beta',
    })
    const setProject = vi.spyOn(configManager, 'setProject').mockImplementation(() => {})
    const createProjectId = vi.spyOn(configManager, 'createProjectId')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(createProjectId).not.toHaveBeenCalled()
    expect(setProject).toHaveBeenCalledWith('id-beta-existing', {
      addedAt: '2025-06-01T00:00:00.000Z',
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
  })

  it('titles the pull Listr task with the API project name and reports the pulled environment count', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([linkedProject('id-acme', 'acme', 'api-project-1', true)])
    get.mockResolvedValue([
      {environments: [], id: 'api-project-1', name: 'acme', slug: 'acme'},
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        environments: [
          {createdAt: '2026-01-01T00:00:00.000Z', id: 'api-env-9', name: 'production', url: 'https://beta.com'},
          {createdAt: '2026-01-01T00:00:00.000Z', id: 'api-env-10', name: 'staging', url: 'https://staging.beta.com'},
        ],
        id: 'api-project-9',
        name: 'beta',
        slug: 'beta',
      },
    ])
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(titlesOf(0)).toEqual(['Pull project "beta" from the API'])
    expect(outputsOf(0)).toEqual(['Pulled with 2 environments'])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pulled 1 project, 2 environments'))
  })

  it('pulls every API project when nothing is configured locally yet', async () => {
    get.mockResolvedValue([
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        environments: [],
        id: 'api-project-1',
        name: 'acme',
        slug: 'acme',
      },
    ])
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('acme')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pulled 1 project, 0 environments'))
  })

  it('does not construct a Listr and reports zero when every API project is already linked locally', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([linkedProject('id-acme', 'acme', 'api-project-1', true)])
    get.mockResolvedValue([{environments: [], id: 'api-project-1', name: 'acme', slug: 'acme'}])

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pulled 0 projects, 0 environments'))
  })
})
