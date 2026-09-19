import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/hook/push.js'
import {type ResourceState} from '../../../src/lib/diff-state.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'
import {sha256} from '../../helpers/sha256.js'

type HookFile = {
  content: string
  filename: string
}

type PushWithLoadFiles = {loadFiles(path: string): Promise<HookFile[]>}
type PushWithPushFile = {
  failedCount: number
  pushFile(file: HookFile, beforeState: ResourceState | undefined, task?: {output: string}): Promise<void>
  wpClient: {put: ReturnType<typeof vi.fn>}
}

async function loadFiles(path: string): Promise<HookFile[]> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithLoadFiles).loadFiles(path)
}

describe('hook push', () => {
  describe('loadFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-hook-push-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('reads every .php file with its content and filename without extension', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php\nfinal class Hello {}\n')
      writeFileSync(join(dir, 'hello-world.php'), '<?php\nfinal class HelloWorld {}\n')

      const files = await loadFiles(dir)

      files.sort((a, b) => a.filename.localeCompare(b.filename))
      expect(files).toEqual([
        {content: '<?php\nfinal class Hello {}\n', filename: 'hello'},
        {content: '<?php\nfinal class HelloWorld {}\n', filename: 'hello-world'},
      ])
    })

    it('ignores non-.php files in the directory', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php')
      writeFileSync(join(dir, 'README.md'), '# notes')
      writeFileSync(join(dir, '.DS_Store'), '')

      const files = await loadFiles(dir)

      expect(files).toHaveLength(1)
      expect(files[0].filename).toBe('hello')
    })

    it('returns an empty array when the directory does not exist yet', async () => {
      const files = await loadFiles(join(dir, 'does-not-exist'))

      expect(files).toEqual([])
    })

    it('reads a file nested in a subdirectory, filename using forward slashes', async () => {
      mkdirSync(join(dir, 'content'), {recursive: true})
      writeFileSync(join(dir, 'content', 'filters.php'), '<?php')

      const files = await loadFiles(dir)

      expect(files).toEqual([{content: '<?php', filename: 'content/filters'}])
    })
  })

  describe('pushFile', () => {
    const file: HookFile = {content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n', filename: 'hello'}

    it('PUTs to loopress/v1/hook-files with the filename and raw content in the body', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({filename: 'hello'})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}

      await (cmd as unknown as PushWithPushFile).pushFile(file, undefined)

      expect(put).toHaveBeenCalledWith('loopress/v1/hook-files', {content: file.content, filename: file.filename})
    })

    // The full expectedRevision matrix (omitted on a first push, sent as the sha256 of
    // beforeState's content, a 412 surfaced like any other push failure) lives once in
    // api/push.test.ts: pushFile() here is the exact same shared resourcePushCommand() factory
    // code, not a reimplementation. The end-to-end run() test below covers hook's own wiring
    // into that shared code.

    it('reports a skipped syntax check in task.output without failing the push', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)

      const put = vi.fn().mockResolvedValueOnce({filename: 'hello', syntax_check: 'skipped'})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}

      await (cmd as unknown as PushWithPushFile).pushFile(file, undefined, task)

      expect(task.output).toBe('Pushed: hello (syntax check skipped, unavailable on this host)')
    })

    it('routes the failure message through task.output and rethrows so Listr marks the task failed', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}

      await expect((cmd as unknown as PushWithPushFile).pushFile(file, undefined, task)).rejects.toThrow('boom')

      expect(task.output).toBe('Failed to push hello: boom')
      expect((cmd as unknown as PushWithPushFile).failedCount).toBe(1)
    })

    it('rejects a filename the server route would never match, without calling the API', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}
      const invalidFile: HookFile = {content: '<?php', filename: 'WITH_MAJ_HOOK'}

      await expect((cmd as unknown as PushWithPushFile).pushFile(invalidFile, undefined, task)).rejects.toThrow(
        'Invalid filename "WITH_MAJ_HOOK"',
      )

      expect(put).not.toHaveBeenCalled()
      expect(task.output).toContain('Invalid filename "WITH_MAJ_HOOK"')
      expect((cmd as unknown as PushWithPushFile).failedCount).toBe(1)
    })

    it('accepts a nested filename', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({filename: 'content/filters'})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const nestedFile: HookFile = {
        content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class ContentFilters {}\n',
        filename: 'content/filters',
      }

      await (cmd as unknown as PushWithPushFile).pushFile(nestedFile, undefined)

      expect(put).toHaveBeenCalledWith('loopress/v1/hook-files', {
        content: nestedFile.content,
        filename: 'content/filters',
      })
    })

    it('rejects a filename attempting path traversal, without calling the API', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}
      const traversalFile: HookFile = {content: '<?php', filename: 'content/..'}

      await expect((cmd as unknown as PushWithPushFile).pushFile(traversalFile, undefined, task)).rejects.toThrow(
        'Invalid filename "content/.."',
      )

      expect(put).not.toHaveBeenCalled()
    })

    it('rejects a file missing declare(strict_types=1);, without calling the API', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}
      const missingDeclare: HookFile = {content: '<?php\nfinal class Hello {}\n', filename: 'hello'}

      await expect((cmd as unknown as PushWithPushFile).pushFile(missingDeclare, undefined, task)).rejects.toThrow(
        'declare(strict_types=1);" is missing',
      )

      expect(put).not.toHaveBeenCalled()
      expect((cmd as unknown as PushWithPushFile).failedCount).toBe(1)
    })

    it('rejects a file with declare(strict_types=1); appearing more than once, without calling the API', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}
      const duplicateDeclare: HookFile = {
        content: '<?php\ndeclare(strict_types=1);\ndeclare(strict_types=1);\nfinal class Hello {}\n',
        filename: 'hello',
      }

      await expect((cmd as unknown as PushWithPushFile).pushFile(duplicateDeclare, undefined, task)).rejects.toThrow(
        'declare(strict_types=1);" appears more than once',
      )

      expect(put).not.toHaveBeenCalled()
      expect((cmd as unknown as PushWithPushFile).failedCount).toBe(1)
    })
  })

  describe('run', () => {
    class TestPush extends Push {
      protected override async guardProductionPush(): Promise<void> {}
      protected override async recordDeployment(): Promise<void> {}

      setup(localConfig: LoopressLocalConfig, siteConfig: EnvironmentConfig) {
        this.localConfig = localConfig
        this.siteConfig = siteConfig
        this.dryRun = false
      }
    }

    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-hook-push-run-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    function make(argv: string[] = []) {
      const cmd = new TestPush(argv, fakeOclifConfig)
      cmd.setup({}, makeEnv('production', 'https://acme.com'))
      const logs = silenceLogs(cmd)
      const put = vi.fn().mockResolvedValue({filename: 'hello'})
      const get = vi.fn().mockResolvedValue([])
      const del = vi.fn().mockResolvedValue({})
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {delete: del, get, put}
      return {cmd, del, get, logs, put}
    }

    it('pushes every local file, logs the banner and found count, and reports success', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n')
      const {cmd, logs, put} = make([dir])

      const result = await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('Pushing hooks to https://acme.com')
      expect(logs.log).toHaveBeenCalledWith('Found 1 hook file to push')
      expect(put).toHaveBeenCalledWith('loopress/v1/hook-files', expect.objectContaining({filename: 'hello'}))
      expect(logs.log).toHaveBeenCalledWith('All hooks pushed.')
      expect(result).toEqual({pruned: [], pushed: ['hello'], status: 'success'})
    })

    it('sends expectedRevision end to end, computed from the remote listing read for the rollback snapshot (#234)', async () => {
      const remoteContent = '<?php\n\ndeclare(strict_types=1);\n\nfinal class OldHello {}\n'
      writeFileSync(join(dir, 'hello.php'), '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n')
      const {cmd, get, put} = make([dir])
      get.mockResolvedValue([{content: remoteContent, filename: 'hello'}])

      await cmd.run()

      expect(put).toHaveBeenCalledWith(
        'loopress/v1/hook-files',
        expect.objectContaining({expectedRevision: sha256(remoteContent), filename: 'hello'}),
      )
    })

    it('errors with the failed count instead of reporting success when a push fails', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n')
      const {cmd, put} = make([dir])
      put.mockRejectedValue(new Error('boom'))

      await expect(cmd.run()).rejects.toThrow(/1 hook file.*failed to push/)
    })

    it('does not push anything on a dry run, and reports dry-run status', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n')
      const {cmd, put} = make([dir])
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true

      const result = await cmd.run()

      expect(put).not.toHaveBeenCalled()
      expect(result.status).toBe('dry-run')
    })

    it('prunes server-side files not present locally when --prune is passed', async () => {
      const {cmd, del, get, logs} = make([dir, '--prune'])
      ;(cmd as unknown as {yes: boolean}).yes = true
      get.mockResolvedValue([{filename: 'stale'}])

      const result = await cmd.run()

      expect(del).toHaveBeenCalledWith('loopress/v1/hook-files?filename=stale')
      expect(result.pruned).toEqual(['stale'])
      expect(logs.log).toHaveBeenCalledWith('Pruned: stale')
    })
  })
})
