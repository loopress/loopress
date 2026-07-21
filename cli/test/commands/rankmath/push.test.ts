import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/rankmath/push.js'
import {RankMathRedirect} from '../../../src/utils/rankmath-format.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type PushInternals = {
  dryRun: boolean
  failedCount: number
  pushPostMetaFile(postType: string, filePath: string, task?: {output: string}): Promise<void>
  pushRedirectFile(filePath: string, task?: {output: string}): Promise<void>
  pushSettings(basePath: string): Promise<void>
  wpClient: {post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
}

function makeCmd(): {cmd: PushInternals; logs: ReturnType<typeof silenceLogs>} {
  const cmd = new Push([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd: cmd as unknown as PushInternals, logs}
}

// Mirrors WpClient.isNotFoundError()'s expected shape (see lib/wp-client.ts).
function notFoundError(): Error {
  return Object.assign(new Error('not found'), {cause: {response: {statusCode: 404}}})
}

describe('rankmath push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-rankmath-push-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('pushPostMetaFile', () => {
    it('posts the slug and meta from the file to the post-meta endpoint', async () => {
      const {cmd} = makeCmd()
      const post = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {post, put: vi.fn()}
      const file = join(dir, 'about.json')
      writeFileSync(file, JSON.stringify({meta: {'rank_math_title': 'About'}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await cmd.pushPostMetaFile('page', file, task)

      expect(post).toHaveBeenCalledWith('loopress/v1/rankmath/post-meta/page', {meta: {'rank_math_title': 'About'}, slug: 'about'})
      expect(task.output).toBe('Pushed: about')
    })

    it('does nothing in dry-run mode', async () => {
      const {cmd} = makeCmd()
      cmd.dryRun = true
      const post = vi.fn()
      cmd.wpClient = {post, put: vi.fn()}
      const file = join(dir, 'about.json')
      writeFileSync(file, JSON.stringify({meta: {}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await cmd.pushPostMetaFile('page', file, task)

      expect(post).not.toHaveBeenCalled()
      expect(task.output).toContain('[dry-run]')
    })

    it('records the failure and rethrows so Listr marks the task failed', async () => {
      const {cmd} = makeCmd()
      const post = vi.fn().mockRejectedValueOnce(new Error('boom'))
      cmd.wpClient = {post, put: vi.fn()}
      const file = join(dir, 'about.json')
      writeFileSync(file, JSON.stringify({meta: {}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await expect(cmd.pushPostMetaFile('page', file, task)).rejects.toThrow('boom')

      expect(task.output).toContain('Failed to push')
      expect(cmd.failedCount).toBe(1)
    })
  })

  describe('pushRedirectFile', () => {
    const baseRedirect: RankMathRedirect = {
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
      cmd.wpClient = {post, put}
      const file = join(dir, '4-new.json')
      writeFileSync(file, JSON.stringify({...baseRedirect, id: 4}))
      const task = {output: ''}

      await cmd.pushRedirectFile(file, task)

      expect(put).toHaveBeenCalledWith('loopress/v1/rankmath/redirects/4', {
        headerCode: 301,
        sources: baseRedirect.sources,
        status: 'active',
        urlTo: '/new',
      })
      expect(post).not.toHaveBeenCalled()
      expect(task.output).toBe('Pushed: redirect #4')
      expect(existsSync(file)).toBe(true)
    })

    it('falls back to creating the redirect when the local id is a 404, then renames the file to the assigned id', async () => {
      const {cmd} = makeCmd()
      const put = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockResolvedValueOnce({...baseRedirect, id: 9})
      cmd.wpClient = {post, put}
      const file = join(dir, '999-new.json')
      writeFileSync(file, JSON.stringify({...baseRedirect, id: 999}))
      const task = {output: ''}

      await cmd.pushRedirectFile(file, task)

      expect(post).toHaveBeenCalledWith('loopress/v1/rankmath/redirects', {
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
      cmd.wpClient = {post, put}
      const file = join(dir, 'draft.json')
      writeFileSync(file, JSON.stringify({...baseRedirect, id: undefined}))
      const task = {output: ''}

      await cmd.pushRedirectFile(file, task)

      expect(put).not.toHaveBeenCalled()
      expect(task.output).toBe('Pushed: redirect #12')
      expect(existsSync(join(dir, '12-new.json'))).toBe(true)
    })

    it('does nothing in dry-run mode', async () => {
      const {cmd} = makeCmd()
      cmd.dryRun = true
      const put = vi.fn()
      const post = vi.fn()
      cmd.wpClient = {post, put}
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
      const put = vi.fn()
      cmd.wpClient = {post: vi.fn(), put}

      await cmd.pushSettings(dir)

      expect(put).not.toHaveBeenCalled()
    })

    it('PUTs the parsed settings file', async () => {
      const {cmd, logs} = makeCmd()
      const put = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {post: vi.fn(), put}
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({titleSeparator: '-'}))

      await cmd.pushSettings(dir)

      expect(put).toHaveBeenCalledWith('loopress/v1/rankmath/settings', {titleSeparator: '-'})
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Pushed:'))
    })

    it('warns and records the failure without throwing', async () => {
      const {cmd, logs} = makeCmd()
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      cmd.wpClient = {post: vi.fn(), put}
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({titleSeparator: '-'}))

      await cmd.pushSettings(dir)

      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to push'))
      expect(cmd.failedCount).toBe(1)
    })

    it('does not call the API in dry-run mode', async () => {
      const {cmd, logs} = makeCmd()
      cmd.dryRun = true
      const put = vi.fn()
      cmd.wpClient = {post: vi.fn(), put}
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({titleSeparator: '-'}))

      await cmd.pushSettings(dir)

      expect(put).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })
  })
})
