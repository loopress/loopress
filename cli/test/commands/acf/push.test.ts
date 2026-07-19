import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/acf/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

// loadObjects() and pushObject() are private; the cast below is the same escape hatch used
// throughout this CLI's test suite to unit-test command internals without going through the
// full oclif run() lifecycle (see snippet push.test.ts).
type PushWithLoadObjects = {loadObjects(dir: string): Promise<Record<string, unknown>[]>}
type PushWithPushObject = {
  failedCount: number
  pushObject(type: string, object: Record<string, unknown>, task?: {output: string}): Promise<void>
  wpClient: {post: ReturnType<typeof vi.fn>}
}

function loadObjects(dir: string): Promise<Record<string, unknown>[]> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithLoadObjects).loadObjects(dir)
}

describe('acf push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-acf-push-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('loadObjects', () => {
    it('loads every .json file in the directory', async () => {
      writeFileSync(join(dir, 'group_1.json'), JSON.stringify({key: 'group_1', title: 'One'}))
      writeFileSync(join(dir, 'group_2.json'), JSON.stringify({key: 'group_2', title: 'Two'}))

      const objects = await loadObjects(dir)

      expect(objects).toHaveLength(2)
    })

    it('leaves the file on disk untouched (no rename, unlike snippet push)', async () => {
      writeFileSync(join(dir, 'post_type_1.json'), JSON.stringify({key: 'post_type_1', title: 'Original'}))

      await loadObjects(dir)

      expect(existsSync(join(dir, 'post_type_1.json'))).toBe(true)
      expect(JSON.parse(readFileSync(join(dir, 'post_type_1.json'), 'utf8')).title).toBe('Original')
    })

    it('ignores non-.json files', async () => {
      writeFileSync(join(dir, 'README.md'), '# notes')

      const objects = await loadObjects(dir)

      expect(objects).toEqual([])
    })

    it('returns an empty list when the directory does not exist yet', async () => {
      const objects = await loadObjects(join(dir, 'does-not-exist'))

      expect(objects).toEqual([])
    })

    it('skips a file with malformed JSON instead of aborting the rest', async () => {
      writeFileSync(join(dir, 'broken.json'), '{ this is not valid json !!')
      writeFileSync(join(dir, 'fine.json'), JSON.stringify({key: 'group_1', title: 'Fine'}))

      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)

      const objects = await (cmd as unknown as PushWithLoadObjects).loadObjects(dir)

      expect(objects).toHaveLength(1)
      expect(objects[0].title).toBe('Fine')
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('broken.json'))
    })

    it('skips a file whose JSON is missing a "key" instead of aborting the rest', async () => {
      writeFileSync(join(dir, 'no-key.json'), JSON.stringify({title: 'No key'}))
      writeFileSync(join(dir, 'fine.json'), JSON.stringify({key: 'group_1', title: 'Fine'}))

      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)

      const objects = await (cmd as unknown as PushWithLoadObjects).loadObjects(dir)

      expect(objects).toHaveLength(1)
      expect(objects[0].title).toBe('Fine')
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('no-key.json'))
    })
  })

  describe('pushObject', () => {
    const object = {key: 'group_1', title: 'Demo'}

    it('routes the failure message through task.output instead of warn, and rethrows so Listr marks the task failed', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const post = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushObject).wpClient = {post}
      const task = {output: ''}

      await expect((cmd as unknown as PushWithPushObject).pushObject('field-groups', object, task)).rejects.toThrow('boom')

      expect(task.output).toBe('Failed to push group_1: boom')
      expect(logs.warn).not.toHaveBeenCalled()
      expect((cmd as unknown as PushWithPushObject).failedCount).toBe(1)
    })

    it('falls back to warn when called without a task', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const post = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushObject).wpClient = {post}

      await expect((cmd as unknown as PushWithPushObject).pushObject('field-groups', object)).rejects.toThrow('boom')

      expect(logs.warn).toHaveBeenCalledWith('  Failed to push group_1: boom')
      expect((cmd as unknown as PushWithPushObject).failedCount).toBe(1)
    })

    it('posts to the endpoint for the given type with the object as the body', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const post = vi.fn().mockResolvedValueOnce(object)
      ;(cmd as unknown as PushWithPushObject).wpClient = {post}
      const task = {output: ''}

      await (cmd as unknown as PushWithPushObject).pushObject('post-types', object, task)

      expect(post).toHaveBeenCalledWith('loopress/v1/acf/post-types', object)
      expect(task.output).toBe('Pushed: group_1')
    })
  })
})
