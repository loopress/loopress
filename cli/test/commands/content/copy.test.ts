import {beforeEach, describe, expect, it, vi} from 'vitest'

import Copy from '../../../src/commands/content/copy.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {WpClient} from '../../../src/lib/wp-client.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {makeCapabilities} from '../../helpers/capabilities.js'
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

const plugin = (slug: string, status: 'active' | 'inactive') => ({name: slug, plugin: `${slug}/${slug}`, plugin_uri: '', status, version: '1.0'})

// What both sites answer besides the content pages: by default the same theme and plugins, so
// there is nothing to align.
type Site = {capabilities: ReturnType<typeof makeCapabilities>; plugins: unknown[]; themes: unknown[]}
const site = (overrides: Partial<Site> = {}): Site => ({
  capabilities: makeCapabilities(),
  plugins: [plugin('akismet', 'active')],
  themes: [{status: 'active', stylesheet: 'twentytwentyfive'}],
  ...overrides,
})

function siteGet(answers: Site, pages: Record<string, unknown> = {}) {
  return vi.fn(async (path: string) => {
    if (path === 'loopress/v1/capabilities') return answers.capabilities
    if (path === 'wp/v2/plugins') return answers.plugins
    if (path === 'wp/v2/themes') return answers.themes
    return pages[path]
  })
}

function make(argv: string[], target = 'local', sites: {local?: Site; source?: Site} = {}) {
  const cmd = new Copy(argv, fakeOclifConfig)
  const internals = cmd as unknown as {dryRun: boolean; siteConfig: EnvironmentConfig; sourceWp: (from: string) => unknown; wpClient: unknown; yes: boolean}
  internals.siteConfig = makeEnv(target, 'https://acme.local')
  internals.yes = true
  internals.dryRun = argv.includes('--dry-run')
  const source = {get: siteGet(sites.source ?? site(), PAGES)}
  internals.sourceWp = vi.fn(() => source)
  const local = {
    get: siteGet(sites.local ?? site()),
    post: vi.fn(async (_path: string, _body?: unknown) => ({changed: true})),
    put: vi.fn(async (_path: string, _body?: unknown) => ({})),
  }
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
    expect(local.post.mock.calls[3]?.[1]).toEqual({postmeta: [], posts: [{ID: 101}], termRelationships: []})
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

  it('stops on a source page without its list instead of counting it as empty', async () => {
    const {cmd, internals, local} = make(['production'])
    const pages = {...PAGES, 'loopress/v1/content/terms?after=0&limit=100': {next: null, termTaxonomy: [], termmeta: []}}
    internals.sourceWp = vi.fn(() => ({get: siteGet(site(), pages)}))

    await expect(cmd.run()).rejects.toThrow('terms page after 0 from the source has no "terms" list.')
    expect(local.post.mock.calls.map(([path]) => path)).toEqual(['loopress/v1/content/reset'])
  })

  describe('aligning the local site with <from>', () => {
    const activations = (local: ReturnType<typeof make>['local']) =>
      local.post.mock.calls.filter(([path]) => path === 'loopress/v1/theme/activate').map(([, body]) => body)

    it('activates, before the push, the plugins active there and installed but inactive here', async () => {
      const {cmd, local} = make(['production'], 'local', {
        local: site({plugins: [plugin('akismet', 'active'), plugin('code-snippets', 'inactive'), plugin('hello', 'inactive')]}),
        source: site({plugins: [plugin('akismet', 'active'), plugin('code-snippets', 'active'), plugin('hello', 'inactive')]}),
      })
      vi.mocked(fakeOclifConfig.runCommand).mockImplementation(async () => {
        expect(local.put).toHaveBeenCalled()
        return {}
      })

      await cmd.run()

      expect(local.put.mock.calls).toEqual([['wp/v2/plugins/code-snippets/code-snippets', {status: 'active'}]])
    })

    it('warns about plugins active there but not installed here, and never installs them', async () => {
      const {cmd, local} = make(['production'], 'local', {
        source: site({plugins: [plugin('akismet', 'active'), plugin('wpforms-lite', 'active')]}),
      })
      const warn = vi.spyOn(cmd, 'warn')

      await cmd.run()

      expect(warn).toHaveBeenCalledWith('Active on production but not installed locally: wpforms-lite. Declare them in composer.json.')
      expect(local.put).not.toHaveBeenCalled()
    })

    it('activates the theme active there when it is installed here', async () => {
      const {cmd, local} = make(['production'], 'local', {
        local: site({
          capabilities: makeCapabilities({theme: {active: 'astra', isBlock: false, template: 'astra'}}),
          themes: [{status: 'active', stylesheet: 'astra'}, {status: 'inactive', stylesheet: 'twentytwentyfive'}],
        }),
      })

      await cmd.run()

      expect(activations(local)).toEqual([{stylesheet: 'twentytwentyfive'}])
    })

    it('activates the parent of a Loopress child not written here yet, then the child once the push wrote it', async () => {
      const {cmd, local} = make(['production'], 'local', {
        local: site({
          capabilities: makeCapabilities({theme: {active: 'astra', isBlock: false, template: 'astra'}}),
          themes: [{status: 'active', stylesheet: 'astra'}, {status: 'inactive', stylesheet: 'twentytwentyfive'}],
        }),
        source: site({capabilities: makeCapabilities({theme: {active: 'twentytwentyfive-loopress'}})}),
      })
      vi.mocked(fakeOclifConfig.runCommand).mockImplementation(async () => {
        expect(activations(local)).toEqual([{stylesheet: 'twentytwentyfive'}])
        return {}
      })

      await cmd.run()

      expect(activations(local)).toEqual([{stylesheet: 'twentytwentyfive'}, {stylesheet: 'twentytwentyfive-loopress'}])
    })

    it('keeps the local theme, with a warning, when the one active there is not installed here', async () => {
      const {cmd, local} = make(['production'], 'local', {
        source: site({capabilities: makeCapabilities({theme: {active: 'kadence', isBlock: false, template: 'kadence'}})}),
      })
      const warn = vi.spyOn(cmd, 'warn')

      await cmd.run()

      expect(warn).toHaveBeenCalledWith('kadence is active on production but not installed locally, the local site keeps twentytwentyfive.')
      expect(activations(local)).toEqual([])
    })

    it('on --dry-run, says what it would activate and changes nothing', async () => {
      const {cmd, local} = make(['production', '--dry-run'], 'local', {
        local: site({
          capabilities: makeCapabilities({theme: {active: 'astra', isBlock: false, template: 'astra'}}),
          plugins: [plugin('akismet', 'inactive')],
          themes: [{status: 'active', stylesheet: 'astra'}, {status: 'inactive', stylesheet: 'twentytwentyfive'}],
        }),
      })
      const log = vi.spyOn(cmd, 'log')

      await cmd.run()

      expect(log).toHaveBeenCalledWith('[dry-run] Would activate akismet, active on production.')
      expect(log).toHaveBeenCalledWith('[dry-run] Would activate twentytwentyfive instead of astra, like on production.')
      expect(local.put).not.toHaveBeenCalled()
      expect(local.post).not.toHaveBeenCalled()
    })
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
