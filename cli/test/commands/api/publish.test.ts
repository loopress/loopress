import {beforeEach, describe, expect, it, vi} from 'vitest'

import Publish from '../../../src/commands/api/publish.js'
import {authManager} from '../../../src/config/auth.manager.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {ApiClient} from '../../../src/lib/api-client.js'
import {readLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

const {get, post, put} = vi.hoisted(() => ({get: vi.fn(), post: vi.fn(), put: vi.fn()}))

vi.mock('../../../src/lib/api-client.js', () => ({
  ApiClient: vi.fn().mockImplementation(function (this: {get: typeof get; post: typeof post; put: typeof put}) {
    this.get = get
    this.post = post
    this.put = put
  }),
}))

vi.mock('../../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
}))

const {loadFiles} = vi.hoisted(() => ({loadFiles: vi.fn()}))
vi.mock('../../../src/lib/load-files.js', () => ({loadFiles}))

function make(): Publish {
  return new Publish([], fakeOclifConfig)
}

describe('api publish', () => {
  beforeEach(() => {
    vi.mocked(ApiClient).mockClear()
    get.mockReset()
    post.mockReset()
    put.mockReset()
    vi.mocked(readLocalConfig).mockReset()
    loadFiles.mockReset().mockResolvedValue([{code: '<?php', filename: 'products'}])
    vi.spyOn(authManager, 'getAuth').mockReturnValue({email: 'a@b.com', savedAt: '2024-01-01', token: 'jwt-token'})
  })

  it('errors when not logged in', async () => {
    vi.spyOn(authManager, 'getAuth').mockReturnValue(null)
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('Not logged in')
    expect(ApiClient).not.toHaveBeenCalled()
  })

  it('errors when no project is configured for this directory or globally', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({})
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(null)
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('No project configured')
  })

  it('falls back to the globally current project when loopress.json has no projectId', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({})
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue({
      addedAt: '2024-01-01',
      apiProjectId: 'api-project-1',
      environments: {},
      id: 'current-project',
      name: 'Current project',
    })
    vi.spyOn(configManager, 'getProject').mockReturnValue({
      addedAt: '2024-01-01',
      apiProjectId: 'api-project-1',
      environments: {},
      name: 'Current project',
    })
    const cmd = make()
    silenceLogs(cmd)

    await cmd.run()

    expect(post).toHaveBeenCalledWith('projects/api-project-1/api-routes/publish/upsert', expect.anything())
  })

  it('errors when the configured project cannot be found', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'ghost'})
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('Project "ghost" (from loopress.json) not found')
  })

  it('errors when the project has never been synced to the api', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme'})
    vi.spyOn(configManager, 'getProject').mockReturnValue({
      addedAt: '2024-01-01',
      environments: {},
      name: 'Acme',
    })
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('not linked to your Loopress account')
  })

  it('loads route files from the configured path and publishes an upsert then a prune', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({apiDir: 'my-api', projectId: 'acme', rootDir: '.'})
    vi.spyOn(configManager, 'getProject').mockReturnValue({
      addedAt: '2024-01-01',
      apiProjectId: 'api-project-1',
      environments: {},
      name: 'Acme',
    })
    loadFiles.mockResolvedValue([{code: '<?php echo 1;', filename: 'products'}])
    const cmd = make()
    const {log} = silenceLogs(cmd)

    await cmd.run()

    expect(loadFiles).toHaveBeenCalledWith('my-api', expect.objectContaining({extension: '.php'}))
    expect(post).toHaveBeenCalledWith('projects/api-project-1/api-routes/publish/upsert', {
      routes: [{code: '<?php echo 1;', filename: 'products'}],
    })
    expect(post).toHaveBeenCalledWith('projects/api-project-1/api-routes/publish/prune', {
      filenames: ['products'],
    })
    expect(log).toHaveBeenCalledWith('Published 1 route to your Loopress account.')
  })

  it('uses singular/plural correctly for more than one route', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme'})
    vi.spyOn(configManager, 'getProject').mockReturnValue({
      addedAt: '2024-01-01',
      apiProjectId: 'api-project-1',
      environments: {},
      name: 'Acme',
    })
    loadFiles.mockResolvedValue([
      {code: '<?php', filename: 'products'},
      {code: '<?php', filename: 'orders'},
    ])
    const cmd = make()
    const {log} = silenceLogs(cmd)

    await cmd.run()

    expect(log).toHaveBeenCalledWith('Published 2 routes to your Loopress account.')
  })

  it('reports an api failure as a command error and never logs a success message', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme'})
    vi.spyOn(configManager, 'getProject').mockReturnValue({
      addedAt: '2024-01-01',
      apiProjectId: 'api-project-1',
      environments: {},
      name: 'Acme',
    })
    post.mockRejectedValueOnce(new Error('boom'))
    const cmd = make()
    const {log} = silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('boom')
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Published'))
  })
})
