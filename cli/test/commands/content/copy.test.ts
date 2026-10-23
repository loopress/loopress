import {beforeEach, describe, expect, it, vi} from 'vitest'

import Copy from '../../../src/commands/content/copy.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {WpClient} from '../../../src/lib/wp-client.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

const {confirm} = vi.hoisted(() => ({confirm: vi.fn()}))
vi.mock('@inquirer/prompts', () => ({confirm}))

const interactive = vi.hoisted(() => ({value: true}))
vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => interactive.value}))

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
  const local = {post: vi.fn(async (_path: string, _body?: unknown) => ({}))}
  internals.wpClient = local
  silenceLogs(cmd)
  return {cmd, internals, local}
}

describe('content copy', () => {
  beforeEach(() => {
    resetFakeOclifConfig()
    confirm.mockReset()
    interactive.value = true
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

  describe('confirmation', () => {
    const unconfirmed = (argv: string[]) => {
      const made = make(argv)
      ;(made.cmd as unknown as {yes: boolean}).yes = false
      return made
    }

    it('asks before replacing the local content', async () => {
      confirm.mockResolvedValue(true)
      const {cmd, local} = unconfirmed(['production'])

      await cmd.run()

      expect(confirm).toHaveBeenCalledWith({
        default: true,
        message: 'This deletes the posts, pages and terms of the "local" site and replaces them with production\'s. Continue?',
      })
      expect(local.post).toHaveBeenCalled()
    })

    it('stops when the confirmation is declined', async () => {
      confirm.mockResolvedValue(false)
      const {cmd, local} = unconfirmed(['production'])

      await expect(cmd.run()).rejects.toThrow(/^Aborted\.$/)
      expect(local.post).not.toHaveBeenCalled()
    })

    it('needs --yes outside a TTY', async () => {
      interactive.value = false
      const {cmd, local} = unconfirmed(['production'])

      await expect(cmd.run()).rejects.toThrow(
        'This deletes the posts, pages and terms of the "local" site and replaces them with production\'s. Pass --yes to confirm.',
      )
      expect(confirm).not.toHaveBeenCalled()
      expect(local.post).not.toHaveBeenCalled()
    })

    it('does not ask on a dry run', async () => {
      const {cmd} = unconfirmed(['production', '--dry-run'])

      await cmd.run()

      expect(confirm).not.toHaveBeenCalled()
    })
  })

  describe('sourceWp', () => {
    type Seam = {projectId: string; sourceWp(from: string): WpClient}
    const seam = () => {
      const cmd = new Copy([], fakeOclifConfig) as unknown as Seam
      cmd.projectId = 'acme'
      return cmd
    }

    const project = (environments: Record<string, ReturnType<typeof makeEnv>>) =>
      vi.spyOn(configManager, 'getProject').mockReturnValue({environments, id: 'acme', name: 'Acme'} as never)

    it('connects to <from> with its credentials', () => {
      const getProject = project({production: makeEnv('production', 'https://acme.com')})

      expect(seam().sourceWp('production')).toBeInstanceOf(WpClient)
      expect(getProject).toHaveBeenCalledWith('acme')
    })

    it('names the available environments when <from> is unknown', () => {
      project({local: makeEnv('local'), production: makeEnv('production')})

      expect(() => seam().sourceWp('staging')).toThrow('Environment "staging" not found. Available: local, production')
    })

    it('refuses an environment without credentials', () => {
      project({production: makeEnv('production', 'https://acme.com', '')})

      expect(() => seam().sourceWp('production')).toThrow('No credentials configured for https://acme.com. Run `lps project config` to add them.')
    })
  })
})
