import {beforeEach, describe, expect, it, vi} from 'vitest'

import Publish from '../../../src/commands/snippet/publish.js'
import {authManager} from '../../../src/config/auth.manager.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {ApiClient} from '../../../src/lib/api-client.js'
import {Snippet} from '../../../src/types/snippet.js'
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

const {loadSnippets} = vi.hoisted(() => ({loadSnippets: vi.fn()}))
vi.mock('../../../src/lib/load-snippets.js', () => ({loadSnippets}))

function make(): Publish {
  return new Publish([], fakeOclifConfig)
}

const snippet = (overrides: Partial<Snippet> = {}): Snippet => ({
  active: true,
  code: 'console.log(1)',
  insertMethod: 'auto',
  location: 'footer',
  name: 'Cookie Banner!',
  path: '/tmp/snippets/cookie-banner.js',
  priority: 10,
  shortcodeAttributes: [],
  tags: [],
  type: 'js',
  ...overrides,
})

describe('snippet publish', () => {
  beforeEach(() => {
    vi.mocked(ApiClient).mockClear()
    get.mockReset()
    post.mockReset()
    put.mockReset()
    vi.mocked(readLocalConfig).mockReset()
    loadSnippets.mockReset().mockResolvedValue([snippet()])
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

    expect(post).toHaveBeenCalledWith('projects/api-project-1/snippets/publish/upsert', expect.anything())
    expect(post).toHaveBeenCalledWith('projects/api-project-1/snippets/publish/prune', expect.anything())
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

  it('loads snippets from the configured path and publishes them with a slug derived from the name', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme', rootDir: '.', snippetsDir: 'my-snippets'})
    vi.spyOn(configManager, 'getProject').mockReturnValue({
      addedAt: '2024-01-01',
      apiProjectId: 'api-project-1',
      environments: {},
      name: 'Acme',
    })
    loadSnippets.mockResolvedValue([snippet({name: 'Cookie Banner!'})])
    const cmd = make()
    const {log} = silenceLogs(cmd)

    await cmd.run()

    expect(loadSnippets).toHaveBeenCalledWith('my-snippets')
    expect(post).toHaveBeenCalledWith('projects/api-project-1/snippets/publish/upsert', {
      snippets: [
        expect.objectContaining({
          active: true,
          code: 'console.log(1)',
          name: 'Cookie Banner!',
          slug: 'cookie-banner',
        }),
      ],
    })
    expect(post).toHaveBeenCalledWith('projects/api-project-1/snippets/publish/prune', {
      slugs: ['cookie-banner'],
    })
    expect(log).toHaveBeenCalledWith('Published 1 snippet to your Loopress account.')
  })

  it('splits a large collection into several upsert batches of 20, then prunes once with every slug', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme'})
    vi.spyOn(configManager, 'getProject').mockReturnValue({
      addedAt: '2024-01-01',
      apiProjectId: 'api-project-1',
      environments: {},
      name: 'Acme',
    })
    const many = Array.from({length: 45}, (_, i) => snippet({name: `Snippet ${i}`}))
    loadSnippets.mockResolvedValue(many)
    const cmd = make()
    silenceLogs(cmd)

    await cmd.run()

    const upsertCalls = post.mock.calls.filter(([url]) => url === 'projects/api-project-1/snippets/publish/upsert')
    expect(upsertCalls).toHaveLength(3)
    expect((upsertCalls[0][1] as {snippets: unknown[]}).snippets).toHaveLength(20)
    expect((upsertCalls[1][1] as {snippets: unknown[]}).snippets).toHaveLength(20)
    expect((upsertCalls[2][1] as {snippets: unknown[]}).snippets).toHaveLength(5)
    const [, prunePayload] = post.mock.calls.find(([url]) => url === 'projects/api-project-1/snippets/publish/prune')!
    expect((prunePayload as {slugs: string[]}).slugs).toHaveLength(45)
  })

  it('reports a snippet-loading failure as a command error', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme'})
    vi.spyOn(configManager, 'getProject').mockReturnValue({
      addedAt: '2024-01-01',
      apiProjectId: 'api-project-1',
      environments: {},
      name: 'Acme',
    })
    loadSnippets.mockRejectedValue(new Error('Error loading snippets: boom'))
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('Error loading snippets: boom')
    expect(post).not.toHaveBeenCalled()
  })
})
