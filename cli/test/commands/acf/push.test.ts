import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/acf/push.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

// loadObjects() and pushObject() are private; the cast below is the same escape hatch used
// throughout this CLI's test suite to unit-test command internals without going through the
// full oclif run() lifecycle (see snippet push.test.ts).
type PushWithLoadObjects = {loadObjects(dir: string): Promise<Array<Record<string, unknown>>>}
type PushWithPushObject = {
  failedCount: number
  pushObject(type: string, object: Record<string, unknown>, task?: {output: string}): Promise<void>
  wpClient: {get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>}
}

// Mirrors WpClient.isNotFoundError()'s expected shape (see lib/wp-client.ts).
function notFoundError(): Error {
  return new Error('not found', {cause: {response: {statusCode: 404}}})
}

async function loadObjects(dir: string): Promise<Array<Record<string, unknown>>> {
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
      const get = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushObject).wpClient = {get, post}
      const task = {output: ''}

      await expect((cmd as unknown as PushWithPushObject).pushObject('field-groups', object, task)).rejects.toThrow('boom')

      expect(task.output).toBe('Failed to push group_1: boom')
      expect(logs.warn).not.toHaveBeenCalled()
      expect((cmd as unknown as PushWithPushObject).failedCount).toBe(1)
    })

    it('falls back to warn when called without a task', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const get = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushObject).wpClient = {get, post}

      await expect((cmd as unknown as PushWithPushObject).pushObject('field-groups', object)).rejects.toThrow('boom')

      expect(logs.warn).toHaveBeenCalledWith('  Failed to push group_1: boom')
      expect((cmd as unknown as PushWithPushObject).failedCount).toBe(1)
    })

    it('posts to the endpoint for the given type with the object as the body when it does not exist remotely yet (a first push)', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const get = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockResolvedValueOnce(object)
      ;(cmd as unknown as PushWithPushObject).wpClient = {get, post}
      const task = {output: ''}

      await (cmd as unknown as PushWithPushObject).pushObject('post-types', object, task)

      expect(get).toHaveBeenCalledWith('loopress/v1/acf/post-types/group_1')
      expect(post).toHaveBeenCalledWith('loopress/v1/acf/post-types', object)
      expect(task.output).toBe('Pushed: group_1')
    })

    it('reads the object’s current revision first, then posts the object with that revision as a precondition (#234)', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const get = vi.fn().mockResolvedValueOnce({key: 'group_1', revision: 'rev-1', title: 'Old'})
      const post = vi.fn().mockResolvedValueOnce(object)
      ;(cmd as unknown as PushWithPushObject).wpClient = {get, post}
      const task = {output: ''}

      await (cmd as unknown as PushWithPushObject).pushObject('field-groups', object, task)

      expect(get).toHaveBeenCalledWith('loopress/v1/acf/field-groups/group_1')
      expect(post).toHaveBeenCalledWith('loopress/v1/acf/field-groups', {...object, expectedRevision: 'rev-1'})
      expect(task.output).toBe('Pushed: group_1')
    })

    it('records the failure and rethrows so Listr marks the task failed when the write is refused as stale (412)', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const get = vi.fn().mockResolvedValueOnce({key: 'group_1', revision: 'rev-1', title: 'Old'})
      const post = vi
        .fn()
        .mockRejectedValueOnce(new Error('Request failed (412) on .../acf/field-groups: "group_1" changed on WordPress since it was last read.'))
      ;(cmd as unknown as PushWithPushObject).wpClient = {get, post}
      const task = {output: ''}

      await expect((cmd as unknown as PushWithPushObject).pushObject('field-groups', object, task)).rejects.toThrow('412')

      expect(logs.warn).not.toHaveBeenCalled()
      expect(task.output).toContain('Failed to push')
      expect((cmd as unknown as PushWithPushObject).failedCount).toBe(1)
    })

    it('records the failure and rethrows when reading the current revision itself fails (not a 404)', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const get = vi.fn().mockRejectedValueOnce(new Error('server error', {cause: {response: {statusCode: 500}}}))
      const post = vi.fn()
      ;(cmd as unknown as PushWithPushObject).wpClient = {get, post}
      const task = {output: ''}

      await expect((cmd as unknown as PushWithPushObject).pushObject('field-groups', object, task)).rejects.toThrow('server error')

      expect(post).not.toHaveBeenCalled()
      expect(logs.warn).not.toHaveBeenCalled()
      expect(task.output).toContain('Failed to push')
      expect((cmd as unknown as PushWithPushObject).failedCount).toBe(1)
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

    function makeRunCmd(argv: string[] = []) {
      const cmd = new TestPush(argv, fakeOclifConfig)
      cmd.setup({rootDir: dir}, makeEnv('production', 'https://acme.com'))
      const logs = silenceLogs(cmd)
      const get = vi.fn().mockRejectedValue(notFoundError())
      const post = vi.fn().mockResolvedValue({})
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, post}
      return {cmd, get, logs, post}
    }

    function writeObject(type: string, key: string): void {
      mkdirSync(join(dir, 'acf', type), {recursive: true})
      writeFileSync(join(dir, 'acf', type, `${key}.json`), JSON.stringify({key, title: key}))
    }

    it('pushes every object of every type to its own endpoint, then reports success', async () => {
      writeObject('field-groups', 'group_1')
      writeObject('taxonomies', 'taxonomy_1')
      const {cmd, logs, post} = makeRunCmd()

      await cmd.run()

      expect(post).toHaveBeenCalledWith('loopress/v1/acf/field-groups', {key: 'group_1', title: 'group_1'})
      expect(post).toHaveBeenCalledWith('loopress/v1/acf/taxonomies', {key: 'taxonomy_1', title: 'taxonomy_1'})
      expect(post).toHaveBeenCalledTimes(2)
      expect(logs.log).toHaveBeenCalledWith('Pushing ACF configuration to https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`ACF path: ${join(dir, 'acf')}`)
      expect(logs.log).toHaveBeenCalledWith('Found 1 field-groups to push')
      expect(logs.log).toHaveBeenCalledWith('All ACF objects pushed.')
    })

    it('limits the push to the types passed with --type', async () => {
      writeObject('field-groups', 'group_1')
      writeObject('taxonomies', 'taxonomy_1')
      const {cmd, post} = makeRunCmd(['--type', 'taxonomies'])

      await cmd.run()

      expect(post).toHaveBeenCalledTimes(1)
      expect(post).toHaveBeenCalledWith('loopress/v1/acf/taxonomies', {key: 'taxonomy_1', title: 'taxonomy_1'})
    })

    it('does not log a "Found" line for a type with no local objects', async () => {
      writeObject('field-groups', 'group_1')
      const {cmd, logs} = makeRunCmd()

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('taxonomies to push'))
    })

    it('neither writes nor reports success on a dry run', async () => {
      writeObject('field-groups', 'group_1')
      const {cmd, logs, post} = makeRunCmd()
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true

      await cmd.run()

      expect(post).not.toHaveBeenCalled()
      expect(logs.log).not.toHaveBeenCalledWith('All ACF objects pushed.')
    })

    it('errors with the total failed count when some pushes fail, instead of reporting success', async () => {
      writeObject('field-groups', 'group_1')
      writeObject('post-types', 'post_type_1')
      const {cmd, logs, post} = makeRunCmd()
      post.mockRejectedValue(new Error('boom'))

      await expect(cmd.run()).rejects.toThrow('2 ACF objects failed to push.')
      expect(logs.log).not.toHaveBeenCalledWith('All ACF objects pushed.')
    })
  })
})
