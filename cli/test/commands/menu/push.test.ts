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
  wpClient: {post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
}

function makeCmd(): {cmd: PushInternals; logs: ReturnType<typeof silenceLogs>} {
  const cmd = new Push([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd: cmd as unknown as PushInternals, logs}
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
    it('posts the slug, name, and items from the file to the menus endpoint', async () => {
      const {cmd} = makeCmd()
      const post = vi.fn().mockResolvedValueOnce({items: [], name: 'Main', slug: 'main', warnings: []})
      cmd.wpClient = {post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [{type: 'custom', url: '/x'}], name: 'Main', slug: 'main', warnings: []}))
      const task = {output: ''}

      await cmd.pushMenuFile(file, task)

      expect(post).toHaveBeenCalledWith('loopress/v1/menus', {items: [{type: 'custom', url: '/x'}], name: 'Main', slug: 'main'})
      expect(task.output).toBe('Pushed: main')
    })

    it('appends any server-returned warning to the task output instead of silently dropping it', async () => {
      const {cmd} = makeCmd()
      const post = vi.fn().mockResolvedValueOnce({
        items: [],
        name: 'Main',
        slug: 'main',
        warnings: ['Custom menu item URL points to a different domain'],
      })
      cmd.wpClient = {post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Main', slug: 'main', warnings: []}))
      const task = {output: ''}

      await cmd.pushMenuFile(file, task)

      expect(task.output).toContain('Pushed: main')
      expect(task.output).toContain('warning:')
    })

    it('fails clearly when the file has no slug', async () => {
      const {cmd} = makeCmd()
      cmd.wpClient = {post: vi.fn(), put: vi.fn()}
      const file = join(dir, 'draft.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Draft'}))
      const task = {output: ''}

      await expect(cmd.pushMenuFile(file, task)).rejects.toThrow('missing or invalid "slug"')
      expect(cmd.failedCount).toBe(1)
    })

    it('does nothing in dry-run mode', async () => {
      const {cmd} = makeCmd()
      cmd.dryRun = true
      const post = vi.fn()
      cmd.wpClient = {post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Main', slug: 'main'}))
      const task = {output: ''}

      await cmd.pushMenuFile(file, task)

      expect(post).not.toHaveBeenCalled()
      expect(task.output).toContain('[dry-run]')
    })

    it('records the failure and rethrows so Listr marks the task failed', async () => {
      const {cmd} = makeCmd()
      const post = vi.fn().mockRejectedValueOnce(new Error('boom'))
      cmd.wpClient = {post, put: vi.fn()}
      const file = join(dir, 'main.json')
      writeFileSync(file, JSON.stringify({items: [], name: 'Main', slug: 'main'}))
      const task = {output: ''}

      await expect(cmd.pushMenuFile(file, task)).rejects.toThrow('boom')

      expect(task.output).toContain('Failed to push')
      expect(cmd.failedCount).toBe(1)
    })
  })

  describe('pushLocations', () => {
    it('does nothing when there is no local locations.json', async () => {
      const {cmd} = makeCmd()
      const put = vi.fn()
      cmd.wpClient = {post: vi.fn(), put}

      await cmd.pushLocations(dir)

      expect(put).not.toHaveBeenCalled()
    })

    it('PUTs the parsed locations file', async () => {
      const {cmd, logs} = makeCmd()
      const put = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {post: vi.fn(), put}
      writeFileSync(join(dir, 'locations.json'), JSON.stringify({primary: 'main'}))

      await cmd.pushLocations(dir)

      expect(put).toHaveBeenCalledWith('loopress/v1/menu-locations', {primary: 'main'})
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Pushed:'))
    })

    it('warns and records the failure without throwing', async () => {
      const {cmd, logs} = makeCmd()
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      cmd.wpClient = {post: vi.fn(), put}
      writeFileSync(join(dir, 'locations.json'), JSON.stringify({primary: 'main'}))

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
      const post = vi.fn().mockResolvedValue({items: [], name: 'Main', slug: 'main', warnings: []})
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {post, put}
      return {cmd, logs, post, put}
    }

    it('pushes every local menu and the locations file, then reports success', async () => {
      mkdirSync(join(dir, 'menus'), {recursive: true})
      writeFileSync(join(dir, 'menus', 'main.json'), JSON.stringify({items: [], name: 'Main', slug: 'main'}))
      writeFileSync(join(dir, 'menus', 'locations.json'), JSON.stringify({primary: 'main'}))
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
