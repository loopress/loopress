import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/api/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

interface ApiFile {
  content: string
  filename: string
}

type PushWithLoadFiles = {loadFiles(path: string): Promise<ApiFile[]>}
type PushWithPushFile = {
  failedCount: number
  pushFile(file: ApiFile, task?: {output: string}): Promise<void>
  wpClient: {put: ReturnType<typeof vi.fn>}
}

function loadFiles(path: string): Promise<ApiFile[]> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithLoadFiles).loadFiles(path)
}

describe('api push', () => {
  describe('loadFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-api-push-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('reads every .php file with its content and filename without extension', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php\nfinal class Hello {}\n')
      writeFileSync(join(dir, 'hello-world.php'), '<?php\nfinal class HelloWorld {}\n')

      const files = await loadFiles(dir)

      expect(files.sort((a, b) => a.filename.localeCompare(b.filename))).toEqual([
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
  })

  describe('pushFile', () => {
    const file: ApiFile = {content: '<?php\nfinal class Hello {}\n', filename: 'hello'}

    it('PUTs to loopress/v1/api-files/<filename> with the raw content', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}

      await (cmd as unknown as PushWithPushFile).pushFile(file)

      expect(put).toHaveBeenCalledWith('loopress/v1/api-files/hello', {content: file.content})
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
  })
})
