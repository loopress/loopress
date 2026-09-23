import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/seo/push.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {type SeoRedirect} from '../../../src/utils/seo-format.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type PushInternals = {
  allowExternalRedirects: boolean
  dryRun: boolean
  failedCount: number
  pushPostMetaFile(postType: string, filePath: string, task?: {output: string}): Promise<void>
  pushRedirectFile(filePath: string, task?: {output: string}): Promise<void>
  pushSettings(basePath: string): Promise<void>
  wpClient: {get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
}

function makeCmd(): {cmd: PushInternals; logs: ReturnType<typeof silenceLogs>} {
  const cmd = new Push([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd: cmd as unknown as PushInternals, logs}
}

// Mirrors WpClient.isNotFoundError()'s expected shape (see lib/wp-client.ts).
function notFoundError(): Error {
  return new Error('not found', {cause: {response: {statusCode: 404}}})
}

describe('seo push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-seo-push-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('pushPostMetaFile', () => {
    it('reads the post’s current SEO-meta revision first, then posts the slug, meta, and that revision as a precondition (#234)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockResolvedValueOnce({meta: {}, revision: 'rev-1', slug: 'about', title: 'About'})
      const post = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'about.json')
      writeFileSync(file, JSON.stringify({meta: {seo_title: 'About'}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await cmd.pushPostMetaFile('page', file, task)

      expect(get).toHaveBeenCalledWith('loopress/v1/seo/post-meta/page/about')
      expect(post).toHaveBeenCalledWith('loopress/v1/seo/post-meta/page', {
        expectedRevision: 'rev-1',
        meta: {seo_title: 'About'},
        slug: 'about',
      })
      expect(task.output).toBe('Pushed: about')
    })

    it('omits expectedRevision for a post whose SEO meta does not exist remotely yet (a first push)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'about.json')
      writeFileSync(file, JSON.stringify({meta: {seo_title: 'About'}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await cmd.pushPostMetaFile('page', file, task)

      expect(post).toHaveBeenCalledWith('loopress/v1/seo/post-meta/page', {meta: {seo_title: 'About'}, slug: 'about'})
      expect(task.output).toBe('Pushed: about')
    })

    it('does nothing in dry-run mode, not even reading the current revision', async () => {
      const {cmd} = makeCmd()
      cmd.dryRun = true
      const get = vi.fn()
      const post = vi.fn()
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'about.json')
      writeFileSync(file, JSON.stringify({meta: {}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await cmd.pushPostMetaFile('page', file, task)

      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(task.output).toContain('[dry-run]')
    })

    it('records the failure and rethrows so Listr marks the task failed', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockResolvedValueOnce({meta: {}, revision: 'rev-1', slug: 'about', title: 'About'})
      const post = vi.fn().mockRejectedValueOnce(new Error('boom'))
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'about.json')
      writeFileSync(file, JSON.stringify({meta: {}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await expect(cmd.pushPostMetaFile('page', file, task)).rejects.toThrow('boom')

      expect(task.output).toContain('Failed to push')
      expect(cmd.failedCount).toBe(1)
    })

    it('records the failure and rethrows when reading the current revision itself fails (not a 404)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(new Error('server error', {cause: {response: {statusCode: 500}}}))
      const post = vi.fn()
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'about.json')
      writeFileSync(file, JSON.stringify({meta: {}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await expect(cmd.pushPostMetaFile('page', file, task)).rejects.toThrow('server error')

      expect(post).not.toHaveBeenCalled()
      expect(task.output).toContain('Failed to push')
      expect(cmd.failedCount).toBe(1)
    })

    // The active SEO plugin not supporting redirects surfaces the same way any other REST
    // failure does; post meta itself is unaffected, so this is really about push not silently
    // swallowing the "not supported" message.
    it('surfaces "not supported" errors the same way as any other failure', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockResolvedValueOnce({meta: {}, revision: 'rev-1', slug: 'about', title: 'About'})
      const post = vi.fn().mockRejectedValueOnce(new Error('Redirects are not supported by the active SEO plugin.'))
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'about.json')
      writeFileSync(file, JSON.stringify({meta: {}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await expect(cmd.pushPostMetaFile('page', file, task)).rejects.toThrow('not supported')

      expect(task.output).toContain('not supported')
      expect(cmd.failedCount).toBe(1)
    })
  })

  describe('pushRedirectFile', () => {
    const baseRedirect: SeoRedirect = {
      createdAt: null,
      headerCode: 301,
      hits: 0,
      id: 0,
      sources: [{comparison: 'exact', pattern: '/old'}],
      status: 'active',
      updatedAt: null,
      urlTo: '/new',
    }

    it('PUTs by id and leaves the file in place when the id already exists remotely', async () => {
      const {cmd} = makeCmd()
      const put = vi.fn().mockResolvedValueOnce({})
      const post = vi.fn()
      cmd.wpClient = {get: vi.fn(), post, put}
      const file = join(dir, '4-new.json')
      writeFileSync(file, JSON.stringify({...baseRedirect, id: 4}))
      const task = {output: ''}

      await cmd.pushRedirectFile(file, task)

      expect(put).toHaveBeenCalledWith('loopress/v1/seo/redirects/4', {
        headerCode: 301,
        sources: baseRedirect.sources,
        status: 'active',
        urlTo: '/new',
      })
      expect(post).not.toHaveBeenCalled()
      expect(task.output).toBe('Pushed: redirect #4')
      expect(existsSync(file)).toBe(true)
    })

    it('adds allowExternal to the payload only with --allow-external-redirects', async () => {
      const {cmd} = makeCmd()
      const put = vi.fn().mockResolvedValue({})
      cmd.wpClient = {get: vi.fn(), post: vi.fn(), put}
      const file = join(dir, '5-x.json')
      writeFileSync(file, JSON.stringify({...baseRedirect, id: 5, urlTo: 'https://partner.example/go'}))

      await cmd.pushRedirectFile(file)
      expect(put).toHaveBeenLastCalledWith(
        'loopress/v1/seo/redirects/5',
        expect.not.objectContaining({allowExternal: expect.anything()}),
      )

      cmd.allowExternalRedirects = true
      await cmd.pushRedirectFile(file)
      expect(put).toHaveBeenLastCalledWith(
        'loopress/v1/seo/redirects/5',
        expect.objectContaining({allowExternal: true}),
      )
    })

    it('falls back to creating the redirect when the local id is a 404, then renames the file to the assigned id', async () => {
      const {cmd} = makeCmd()
      const put = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockResolvedValueOnce({...baseRedirect, id: 9})
      cmd.wpClient = {get: vi.fn(), post, put}
      const file = join(dir, '999-new.json')
      writeFileSync(file, JSON.stringify({...baseRedirect, id: 999}))
      const task = {output: ''}

      await cmd.pushRedirectFile(file, task)

      expect(post).toHaveBeenCalledWith('loopress/v1/seo/redirects', {
        headerCode: 301,
        sources: baseRedirect.sources,
        status: 'active',
        urlTo: '/new',
      })
      expect(task.output).toBe('Pushed: redirect #9')
      expect(existsSync(file)).toBe(false)
      expect(existsSync(join(dir, '9-new.json'))).toBe(true)
      expect(JSON.parse(readFileSync(join(dir, '9-new.json'), 'utf8')).id).toBe(9)
    })

    it('creates a redirect straight away when the file has no id, then renames it to the assigned id', async () => {
      const {cmd} = makeCmd()
      const put = vi.fn()
      const post = vi.fn().mockResolvedValueOnce({...baseRedirect, id: 12})
      cmd.wpClient = {get: vi.fn(), post, put}
      const file = join(dir, 'draft.json')
      writeFileSync(file, JSON.stringify({...baseRedirect, id: undefined}))
      const task = {output: ''}

      await cmd.pushRedirectFile(file, task)

      expect(put).not.toHaveBeenCalled()
      expect(task.output).toBe('Pushed: redirect #12')
      expect(existsSync(join(dir, '12-new.json'))).toBe(true)
    })

    it('fails clearly (not silently) when the active plugin does not support redirects', async () => {
      const {cmd} = makeCmd()
      const post = vi.fn().mockRejectedValueOnce(new Error('Redirects are not supported by the active SEO plugin.'))
      cmd.wpClient = {get: vi.fn(), post, put: vi.fn()}
      const file = join(dir, 'draft.json')
      writeFileSync(file, JSON.stringify({...baseRedirect, id: undefined}))
      const task = {output: ''}

      await expect(cmd.pushRedirectFile(file, task)).rejects.toThrow('not supported')

      expect(task.output).toContain('not supported')
      expect(cmd.failedCount).toBe(1)
    })

    it('does nothing in dry-run mode', async () => {
      const {cmd} = makeCmd()
      cmd.dryRun = true
      const put = vi.fn()
      const post = vi.fn()
      cmd.wpClient = {get: vi.fn(), post, put}
      const file = join(dir, '4-new.json')
      writeFileSync(file, JSON.stringify({...baseRedirect, id: 4}))
      const task = {output: ''}

      await cmd.pushRedirectFile(file, task)

      expect(put).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(task.output).toContain('[dry-run]')
    })
  })

  describe('pushSettings', () => {
    it('does nothing when there is no local settings.json', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn()
      const put = vi.fn()
      cmd.wpClient = {get, post: vi.fn(), put}

      await cmd.pushSettings(dir)

      expect(get).not.toHaveBeenCalled()
      expect(put).not.toHaveBeenCalled()
    })

    it('reads the settings’ current revision first, then PUTs the settings and that revision as a precondition (#234)', async () => {
      const {cmd, logs} = makeCmd()
      const get = vi.fn().mockResolvedValueOnce({revision: 'rev-1', settings: {}})
      const put = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {get, post: vi.fn(), put}
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({titleSeparator: '-'}))

      await cmd.pushSettings(dir)

      expect(get).toHaveBeenCalledWith('loopress/v1/seo/settings')
      expect(put).toHaveBeenCalledWith('loopress/v1/seo/settings', {expectedRevision: 'rev-1', settings: {titleSeparator: '-'}})
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Pushed:'))
    })

    it('warns and records the failure without throwing', async () => {
      const {cmd, logs} = makeCmd()
      const get = vi.fn().mockResolvedValueOnce({revision: 'rev-1', settings: {}})
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      cmd.wpClient = {get, post: vi.fn(), put}
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({titleSeparator: '-'}))

      await cmd.pushSettings(dir)

      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to push'))
      expect(cmd.failedCount).toBe(1)
    })

    it('warns and records the failure when reading the current revision itself fails', async () => {
      const {cmd, logs} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(new Error('server error'))
      const put = vi.fn()
      cmd.wpClient = {get, post: vi.fn(), put}
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({titleSeparator: '-'}))

      await cmd.pushSettings(dir)

      expect(put).not.toHaveBeenCalled()
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to push'))
      expect(cmd.failedCount).toBe(1)
    })

    it('does not call the API in dry-run mode, not even reading the current revision', async () => {
      const {cmd, logs} = makeCmd()
      cmd.dryRun = true
      const get = vi.fn()
      const put = vi.fn()
      cmd.wpClient = {get, post: vi.fn(), put}
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({titleSeparator: '-'}))

      await cmd.pushSettings(dir)

      expect(get).not.toHaveBeenCalled()
      expect(put).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })
  })

  describe('pushPostMeta', () => {
    type PostMetaInternals = PushInternals & {pushPostMeta(basePath: string): Promise<void>}

    it('scans every post-type subdirectory of post-meta/, pushing only .json files', async () => {
      const {cmd, logs} = makeCmd() as unknown as {cmd: PostMetaInternals; logs: ReturnType<typeof silenceLogs>}
      const get = vi.fn().mockRejectedValue(notFoundError())
      const post = vi.fn().mockResolvedValue({})
      cmd.wpClient = {get, post, put: vi.fn()}
      mkdirSync(join(dir, 'post-meta', 'page'), {recursive: true})
      mkdirSync(join(dir, 'post-meta', 'post'), {recursive: true})
      writeFileSync(
        join(dir, 'post-meta', 'page', 'about.json'),
        JSON.stringify({meta: {}, slug: 'about', title: 'About'}),
      )
      writeFileSync(join(dir, 'post-meta', 'page', 'notes.txt'), 'not json')
      writeFileSync(
        join(dir, 'post-meta', 'post', 'hello.json'),
        JSON.stringify({meta: {}, slug: 'hello', title: 'Hello'}),
      )

      await cmd.pushPostMeta(dir)

      expect(post).toHaveBeenCalledTimes(2)
      expect(post).toHaveBeenCalledWith('loopress/v1/seo/post-meta/page', {meta: {}, slug: 'about'})
      expect(post).toHaveBeenCalledWith('loopress/v1/seo/post-meta/post', {meta: {}, slug: 'hello'})
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Found 1 page post-meta file'))
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Found 1 post post-meta file'))
    })

    it('says nothing for an empty or missing post-meta directory', async () => {
      const {cmd, logs} = makeCmd() as unknown as {cmd: PostMetaInternals; logs: ReturnType<typeof silenceLogs>}
      cmd.wpClient = {get: vi.fn(), post: vi.fn(), put: vi.fn()}
      mkdirSync(join(dir, 'post-meta', 'page'), {recursive: true})

      await cmd.pushPostMeta(dir)

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Found'))
    })
  })

  describe('pushRedirects', () => {
    type RedirectsInternals = PushInternals & {pushRedirects(basePath: string): Promise<void>}
    const redirect: SeoRedirect = {
      createdAt: null,
      headerCode: 301,
      hits: 0,
      id: 4,
      sources: [{comparison: 'exact', pattern: '/old'}],
      status: 'active',
      updatedAt: null,
      urlTo: '/new',
    }

    it('pushes every .json file in redirects/, ignoring stray non-.json files', async () => {
      const {cmd, logs} = makeCmd() as unknown as {cmd: RedirectsInternals; logs: ReturnType<typeof silenceLogs>}
      const put = vi.fn().mockResolvedValue({})
      cmd.wpClient = {get: vi.fn(), post: vi.fn(), put}
      mkdirSync(join(dir, 'redirects'), {recursive: true})
      writeFileSync(join(dir, 'redirects', '4-new.json'), JSON.stringify(redirect))
      writeFileSync(join(dir, 'redirects', 'README.md'), 'notes')

      await cmd.pushRedirects(dir)

      expect(put).toHaveBeenCalledTimes(1)
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Found 1 redirect'))
    })

    it('says nothing for an empty or missing redirects directory', async () => {
      const {cmd, logs} = makeCmd() as unknown as {cmd: RedirectsInternals; logs: ReturnType<typeof silenceLogs>}
      cmd.wpClient = {get: vi.fn(), post: vi.fn(), put: vi.fn()}

      await cmd.pushRedirects(dir)

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Found'))
    })
  })

  describe('run', () => {
    class TestPush extends Push {
      protected override async guardProductionPush(): Promise<void> {}
      protected override async recordDeployment(): Promise<void> {}

      setup(config: LoopressLocalConfig, siteConfig: EnvironmentConfig) {
        this.localConfig = config
        this.siteConfig = siteConfig
        this.dryRun = false
      }
    }

    // Routes GET calls made both by captureBeforePushState (a full remote-state read before the
    // push) and by the per-item conditional-write precondition reads (#234): a settings read
    // returns the wrapped {revision, settings} shape, a post-meta item read (has a slug segment)
    // returns a single post with a revision, anything else (list endpoints) an empty array.
    function defaultGet() {
      return vi.fn().mockImplementation(async (path: string) => {
        if (path === 'loopress/v1/seo/settings') return {revision: 'settings-rev', settings: {}}
        if (/\/seo\/post-meta\/[^/]+\/[^/]+$/.test(path)) return {meta: {}, revision: 'post-rev', slug: 'x', title: 'X'}
        return []
      })
    }

    function makeRunCmd(argv: string[] = []) {
      const cmd = new TestPush(argv, fakeOclifConfig)
      cmd.setup({rootDir: dir}, makeEnv('production', 'https://acme.com'))
      const logs = silenceLogs(cmd)
      const get = defaultGet()
      const put = vi.fn().mockResolvedValue({})
      const post = vi.fn().mockResolvedValue({})
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, post, put}
      return {cmd, get, logs, post, put}
    }

    it('pushes settings, post-meta and redirects, then reports success', async () => {
      mkdirSync(join(dir, 'seo', 'post-meta', 'page'), {recursive: true})
      mkdirSync(join(dir, 'seo', 'redirects'), {recursive: true})
      writeFileSync(join(dir, 'seo', 'settings.json'), JSON.stringify({titleSeparator: '-'}))
      writeFileSync(
        join(dir, 'seo', 'post-meta', 'page', 'about.json'),
        JSON.stringify({meta: {}, slug: 'about', title: 'About'}),
      )
      writeFileSync(
        join(dir, 'seo', 'redirects', '4-new.json'),
        JSON.stringify({
          createdAt: null,
          headerCode: 301,
          hits: 0,
          id: 4,
          sources: [],
          status: 'active',
          updatedAt: null,
          urlTo: '/new',
        }),
      )
      const {cmd, logs, post, put} = makeRunCmd()

      await cmd.run()

      expect(put).toHaveBeenCalledWith('loopress/v1/seo/settings', {expectedRevision: 'settings-rev', settings: {titleSeparator: '-'}})
      expect(post).toHaveBeenCalledWith('loopress/v1/seo/post-meta/page', {expectedRevision: 'post-rev', meta: {}, slug: 'about'})
      expect(put).toHaveBeenCalledWith('loopress/v1/seo/redirects/4', expect.objectContaining({urlTo: '/new'}))
      expect(logs.log).toHaveBeenCalledWith('All SEO configuration pushed.')
    })

    it('does not report success on a dry run', async () => {
      const {cmd, logs} = makeRunCmd()
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith('All SEO configuration pushed.')
    })

    it('wires --allow-external-redirects through to the redirect payload', async () => {
      mkdirSync(join(dir, 'seo', 'redirects'), {recursive: true})
      writeFileSync(
        join(dir, 'seo', 'redirects', '4-new.json'),
        JSON.stringify({
          createdAt: null,
          headerCode: 301,
          hits: 0,
          id: 4,
          sources: [],
          status: 'active',
          updatedAt: null,
          urlTo: 'https://elsewhere.example/go',
        }),
      )
      const {cmd, put} = makeRunCmd(['--allow-external-redirects'])

      await cmd.run()

      expect(put).toHaveBeenCalledWith('loopress/v1/seo/redirects/4', expect.objectContaining({allowExternal: true}))
    })

    it('errors with the total failed count when some pushes fail, instead of reporting success', async () => {
      mkdirSync(join(dir, 'seo', 'redirects'), {recursive: true})
      writeFileSync(
        join(dir, 'seo', 'redirects', '4-new.json'),
        JSON.stringify({
          createdAt: null,
          headerCode: 301,
          hits: 0,
          id: 4,
          sources: [],
          status: 'active',
          updatedAt: null,
          urlTo: '/new',
        }),
      )
      const {cmd, put} = makeRunCmd()
      put.mockRejectedValue(new Error('boom'))

      await expect(cmd.run()).rejects.toThrow(/1 SEO item.*failed to push/)
    })
  })
})
