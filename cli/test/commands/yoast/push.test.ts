import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/yoast/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type PushInternals = {
  dryRun: boolean
  failedCount: number
  pushPostMetaFile(postType: string, filePath: string, task?: {output: string}): Promise<void>
  pushSettings(basePath: string): Promise<void>
  wpClient: {post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
}

function makeCmd(): {cmd: PushInternals; logs: ReturnType<typeof silenceLogs>} {
  const cmd = new Push([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd: cmd as unknown as PushInternals, logs}
}

describe('yoast push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-yoast-push-test-'))
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
      writeFileSync(file, JSON.stringify({meta: {'_yoast_wpseo_title': 'About'}, slug: 'about', title: 'About'}))
      const task = {output: ''}

      await cmd.pushPostMetaFile('page', file, task)

      expect(post).toHaveBeenCalledWith('loopress/v1/yoast/post-meta/page', {meta: {'_yoast_wpseo_title': 'About'}, slug: 'about'})
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
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({'title_separator': '-'}))

      await cmd.pushSettings(dir)

      expect(put).toHaveBeenCalledWith('loopress/v1/yoast/settings', {'title_separator': '-'})
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Pushed:'))
    })

    it('warns and records the failure without throwing', async () => {
      const {cmd, logs} = makeCmd()
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      cmd.wpClient = {post: vi.fn(), put}
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({'title_separator': '-'}))

      await cmd.pushSettings(dir)

      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to push'))
      expect(cmd.failedCount).toBe(1)
    })

    it('does not call the API in dry-run mode', async () => {
      const {cmd, logs} = makeCmd()
      cmd.dryRun = true
      const put = vi.fn()
      cmd.wpClient = {post: vi.fn(), put}
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({'title_separator': '-'}))

      await cmd.pushSettings(dir)

      expect(put).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })
  })
})
