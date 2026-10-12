import {beforeEach, describe, expect, it, vi} from 'vitest'

import Copy from '../../../src/commands/content/copy.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

const PAGES: Record<string, unknown> = {
  'loopress/v1/content': {home: 'https://acme.com', uploadsUrl: 'https://acme.com/wp-content/uploads'},
  'loopress/v1/content/posts?after=0&limit=100': {next: 100, postmeta: [], posts: Array.from({length: 100}, (_, i) => ({ID: i + 1})), termRelationships: []},
  'loopress/v1/content/posts?after=100&limit=100': {next: null, postmeta: [], posts: [{ID: 101}], termRelationships: []},
  'loopress/v1/content/terms?after=0&limit=100': {next: null, termTaxonomy: [], termmeta: [], terms: [{term_id: 1}]},
}

function make(argv: string[], target = 'local') {
  const cmd = new Copy(argv, fakeOclifConfig)
  const internals = cmd as unknown as {dryRun: boolean; siteConfig: EnvironmentConfig; sourceWp: (from: string) => unknown; wpClient: unknown; yes: boolean}
  internals.siteConfig = makeEnv(target, 'https://acme.local')
  internals.yes = true
  internals.dryRun = argv.includes('--dry-run')
  const source = {get: vi.fn(async (path: string) => PAGES[path])}
  internals.sourceWp = vi.fn(() => source)
  const local = {post: vi.fn(async () => ({}))}
  internals.wpClient = local
  silenceLogs(cmd)
  return {cmd, internals, local}
}

describe('content copy', () => {
  beforeEach(() => {
    resetFakeOclifConfig()
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
  })

  it('resets the local site, copies terms then every post page from <from>, then pushes the project to local', async () => {
    const {cmd, internals, local} = make(['production'])

    const result = await cmd.run()

    expect(internals.sourceWp).toHaveBeenCalledWith('production')
    expect(local.post.mock.calls.map(([path]) => path)).toEqual([
      'loopress/v1/content/reset',
      'loopress/v1/content/terms',
      'loopress/v1/content/posts',
      'loopress/v1/content/posts',
    ])
    expect(local.post).toHaveBeenNthCalledWith(1, 'loopress/v1/content/reset', {home: 'https://acme.com', uploadsUrl: 'https://acme.com/wp-content/uploads'})
    expect(local.post.mock.calls[3][1]).toEqual({postmeta: [], posts: [{ID: 101}], termRelationships: []})
    expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('push', ['--env', 'local', '--yes'])
    expect(result).toEqual({from: 'production', posts: 101, status: 'copied', terms: 1})
  })

  it('on --dry-run, reads every page but writes nothing and pushes nothing', async () => {
    const {cmd, local} = make(['production', '--dry-run'])

    const result = await cmd.run()

    expect(local.post).not.toHaveBeenCalled()
    expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
    expect(result).toEqual({from: 'production', posts: 101, status: 'dry-run', terms: 1})
  })

  it('refuses to copy the local site onto itself', async () => {
    const {cmd, local} = make(['local'])

    await expect(cmd.run()).rejects.toThrow('lps content copy production')
    expect(local.post).not.toHaveBeenCalled()
  })

  it('refuses a project without a local environment to copy into', async () => {
    const {cmd, local} = make(['production'], 'production')

    await expect(cmd.run()).rejects.toThrow('only ever copied into the "local" environment')
    expect(local.post).not.toHaveBeenCalled()
  })

  it('hides --env: the target is always local', () => {
    expect(Copy.baseFlags.env.hidden).toBe(true)
  })
})
