import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/menu/push.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type PushInternals = {
  dryRun: boolean
  failedCount: number
  pushLocations(basePath: string): Promise<void>
  pushMenuFile(filePath: string, task?: {output: string}): Promise<void>
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

describe('menu push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-menu-push-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('pushMenuFile', () => {
    it('reads the menu’s current revision first, then posts the slug, name, items, and that revision as a precondition (#234)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockResolvedValueOnce({items: [], name: 'Main', revision: 'rev-1', slug: 'main', warnings: []})
      const post = vi.fn().mockResolvedValueOnce({items: [], name: 'Main', revision: 'rev-2', slug: 'main', warnings: []})
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [{type: 'custom', url: '/x'}], name: 'Main', slug: 'main', warnings: []}))
      const task = {output: ''}

      await cmd.pushMenuFile(file, task)

      expect(get).toHaveBeenCalledWith('loopress/v1/menus/main')
      expect(post).toHaveBeenCalledWith('loopress/v1/menus', {
        expectedRevision: 'rev-1',
        items: [{type: 'custom', url: '/x'}],
        name: 'Main',
        slug: 'main',
      })
      expect(task.output).toBe('Pushed: main')
    })

    it('omits expectedRevision for a menu that does not exist remotely yet (a first push)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockResolvedValueOnce({items: [], name: 'Main', revision: 'rev-1', slug: 'main', warnings: []})
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Main', slug: 'main'}))
      const task = {output: ''}

      await cmd.pushMenuFile(file, task)

      expect(post).toHaveBeenCalledWith('loopress/v1/menus', {items: [], name: 'Main', slug: 'main'})
      expect(task.output).toBe('Pushed: main')
    })

    it('appends any server-returned warning to the task output instead of silently dropping it', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockResolvedValueOnce({
        items: [],
        name: 'Main',
        revision: 'rev-1',
        slug: 'main',
        warnings: ['Custom menu item URL points to a different domain'],
      })
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Main', slug: 'main', warnings: []}))
      const task = {output: ''}

      await cmd.pushMenuFile(file, task)

      expect(task.output).toContain('Pushed: main')
      expect(task.output).toContain('warning:')
    })

    it('fails clearly when the file has no slug', async () => {
      const {cmd} = makeCmd()
      cmd.wpClient = {get: vi.fn(), post: vi.fn(), put: vi.fn()}
      const file = join(dir, 'draft.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Draft'}))
      const task = {output: ''}

      await expect(cmd.pushMenuFile(file, task)).rejects.toThrow('missing or invalid "slug"')
      expect(cmd.failedCount).toBe(1)
    })

    it('rejects a malformed "items" instead of clearing the remote menu', async () => {
      const {cmd} = makeCmd()
      const post = vi.fn()
      cmd.wpClient = {get: vi.fn(), post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: 'not-an-array', name: 'Main', slug: 'main'}))
      const task = {output: ''}

      await expect(cmd.pushMenuFile(file, task)).rejects.toThrow('"items" must be an array')
      expect(post).not.toHaveBeenCalled()
      expect(cmd.failedCount).toBe(1)
    })

    it('defaults a missing "items" to an empty array', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockResolvedValueOnce({items: [], name: 'Main', revision: 'rev-1', slug: 'main', warnings: []})
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({name: 'Main', slug: 'main'}))
      const task = {output: ''}

      await cmd.pushMenuFile(file, task)

      expect(post).toHaveBeenCalledWith('loopress/v1/menus', {items: [], name: 'Main', slug: 'main'})
    })

    it('does nothing in dry-run mode, not even reading the current revision', async () => {
      const {cmd} = makeCmd()
      cmd.dryRun = true
      const get = vi.fn()
      const post = vi.fn()
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Main', slug: 'main'}))
      const task = {output: ''}

      await cmd.pushMenuFile(file, task)

      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(task.output).toContain('[dry-run]')
    })

    it('records the failure and rethrows so Listr marks the task failed when the write is refused as stale (412)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockResolvedValueOnce({items: [], name: 'Main', revision: 'rev-1', slug: 'main', warnings: []})
      const post = vi
        .fn()
        .mockRejectedValueOnce(new Error('Request failed (412) on .../menus: "main" changed on WordPress since it was last read.'))
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Main', slug: 'main'}))
      const task = {output: ''}

      await expect(cmd.pushMenuFile(file, task)).rejects.toThrow('412')

      expect(task.output).toContain('Failed to push')
      expect(cmd.failedCount).toBe(1)
    })

    it('records the failure and rethrows when reading the current revision itself fails (not a 404)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(new Error('server error', {cause: {response: {statusCode: 500}}}))
      const post = vi.fn()
      cmd.wpClient = {get, post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Main', slug: 'main'}))
      const task = {output: ''}

      await expect(cmd.pushMenuFile(file, task)).rejects.toThrow('server error')

      expect(post).not.toHaveBeenCalled()
      expect(task.output).toContain('Failed to push')
      expect(cmd.failedCount).toBe(1)
    })
  })

  describe('pushLocations', () => {
    it('does nothing when there is no local menu-locations.json', async () => {
      const {cmd} = makeCmd()
      const put = vi.fn()
      cmd.wpClient = {get: vi.fn(), post: vi.fn(), put}

      await cmd.pushLocations(dir)

      expect(put).not.toHaveBeenCalled()
    })

    it('PUTs the parsed locations file', async () => {
      const {cmd, logs} = makeCmd()
      const put = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {get: vi.fn(), post: vi.fn(), put}
      writeFileSync(join(dir, 'menu-locations.json'), JSON.stringify({primary: 'main'}))

      await cmd.pushLocations(dir)

      expect(put).toHaveBeenCalledWith('loopress/v1/menu-locations', {primary: 'main'})
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Pushed:'))
    })

    it('warns and records the failure without throwing', async () => {
      const {cmd, logs} = makeCmd()
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      cmd.wpClient = {get: vi.fn(), post: vi.fn(), put}
      writeFileSync(join(dir, 'menu-locations.json'), JSON.stringify({primary: 'main'}))

      await cmd.pushLocations(dir)

      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to push'))
      expect(cmd.failedCount).toBe(1)
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
      const put = vi.fn().mockResolvedValue({})
      // No existing menu on this environment for any of these tests: pushMenuFile()'s revision
      // read 404s, so every push here falls back to an unconditional create (see push.ts).
      const get = vi.fn().mockRejectedValue(notFoundError())
      const post = vi.fn().mockResolvedValue({items: [], name: 'Main', revision: 'rev-1', slug: 'main', warnings: []})
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, post, put}
      return {cmd, get, logs, post, put}
    }

    it('pushes every local menu and the locations file, then reports success', async () => {
      mkdirSync(join(dir, 'menus'), {recursive: true})
      writeFileSync(join(dir, 'menus', 'main.json'), JSON.stringify({items: [], name: 'Main', slug: 'main'}))
      writeFileSync(join(dir, 'menus', 'menu-locations.json'), JSON.stringify({primary: 'main'}))
      const {cmd, logs, post, put} = makeRunCmd()

      await cmd.run()

      expect(post).toHaveBeenCalledWith('loopress/v1/menus', {items: [], name: 'Main', slug: 'main'})
      expect(put).toHaveBeenCalledWith('loopress/v1/menu-locations', {primary: 'main'})
      expect(logs.log).toHaveBeenCalledWith('All nav menus pushed.')
    })

    it('does not report success on a dry run', async () => {
      const {cmd, logs} = makeRunCmd()
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith('All nav menus pushed.')
    })

    it('errors with the total failed count when some pushes fail, instead of reporting success', async () => {
      mkdirSync(join(dir, 'menus'), {recursive: true})
      writeFileSync(join(dir, 'menus', 'main.json'), JSON.stringify({items: [], name: 'Main', slug: 'main'}))
      const {cmd, post} = makeRunCmd()
      post.mockRejectedValue(new Error('boom'))

      await expect(cmd.run()).rejects.toThrow(/1 menu.*failed to push/)
    })
  })
})
