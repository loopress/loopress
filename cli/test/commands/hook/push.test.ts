import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/hook/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type HookFile = {
  content: string
  filename: string
}

type PushWithLoadFiles = {loadFiles(path: string): Promise<HookFile[]>}
type PushWithPushFile = {
  failedCount: number
  pushFile(file: HookFile, task?: {output: string}): Promise<void>
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

      await (cmd as unknown as PushWithPushFile).pushFile(file)

      expect(put).toHaveBeenCalledWith('loopress/v1/hook-files', {content: file.content, filename: file.filename})
    })

    it('reports a skipped syntax check in task.output without failing the push', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)

      const put = vi.fn().mockResolvedValueOnce({filename: 'hello', syntax_check: 'skipped'})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}

      await (cmd as unknown as PushWithPushFile).pushFile(file, task)

      expect(task.output).toBe('Pushed: hello (syntax check skipped, unavailable on this host)')
    })

    it('routes the failure message through task.output and rethrows so Listr marks the task failed', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}

      await expect((cmd as unknown as PushWithPushFile).pushFile(file, task)).rejects.toThrow('boom')

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

      await expect((cmd as unknown as PushWithPushFile).pushFile(invalidFile, task)).rejects.toThrow(
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

      await (cmd as unknown as PushWithPushFile).pushFile(nestedFile)

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

      await expect((cmd as unknown as PushWithPushFile).pushFile(traversalFile, task)).rejects.toThrow(
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

      await expect((cmd as unknown as PushWithPushFile).pushFile(missingDeclare, task)).rejects.toThrow(
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

      await expect((cmd as unknown as PushWithPushFile).pushFile(duplicateDeclare, task)).rejects.toThrow(
        'declare(strict_types=1);" appears more than once',
      )

      expect(put).not.toHaveBeenCalled()
      expect((cmd as unknown as PushWithPushFile).failedCount).toBe(1)
    })
  })
})
