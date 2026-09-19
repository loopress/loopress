import {createHash} from 'node:crypto'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/api/push.js'
import {type ResourceState} from '../../../src/lib/diff-state.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

const {confirm} = vi.hoisted(() => ({confirm: vi.fn()}))
vi.mock('@inquirer/prompts', () => ({confirm}))

const interactive = vi.hoisted(() => ({value: true}))
vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => interactive.value}))

type ApiFile = {
  content: string
  filename: string
}

type PushWithLoadFiles = {loadFiles(path: string): Promise<ApiFile[]>}
type PushWithPushFile = {
  failedCount: number
  pushFile(file: ApiFile, beforeState: ResourceState | undefined, task?: {output: string}): Promise<undefined | {public?: boolean}>
  wpClient: {put: ReturnType<typeof vi.fn>}
}
type PushWithPrune = {
  dryRun: boolean
  prune(localFilenames: Set<string>): Promise<string[]>
  siteConfig: EnvironmentConfig
  wpClient: {delete: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>}
  yes: boolean
}

async function loadFiles(path: string): Promise<ApiFile[]> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithLoadFiles).loadFiles(path)
}

// Matches AbstractFilesController::revisionOf(): sha256 over the file's raw content.
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
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
      mkdirSync(join(dir, 'invoice-pdf'), {recursive: true})
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), '<?php')

      const files = await loadFiles(dir)

      expect(files).toEqual([{content: '<?php', filename: 'invoice-pdf/[order_id]'}])
    })

    it('reads a file nested more than one level deep', async () => {
      mkdirSync(join(dir, 'orders', '[order_id]', 'items'), {recursive: true})
      writeFileSync(join(dir, 'orders', '[order_id]', 'items', '[item_id].php'), '<?php')

      const files = await loadFiles(dir)

      expect(files).toEqual([{content: '<?php', filename: 'orders/[order_id]/items/[item_id]'}])
    })
  })

  describe('pushFile', () => {
    const file: ApiFile = {content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n', filename: 'hello'}

    it('PUTs to loopress/v1/api-files with the filename and raw content in the body', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({filename: 'hello'})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}

      await (cmd as unknown as PushWithPushFile).pushFile(file, undefined)

      expect(put).toHaveBeenCalledWith('loopress/v1/api-files', {content: file.content, filename: file.filename})
    })

    it('omits expectedRevision when beforeState has no entry for the file (a first push, #234)', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({filename: 'hello'})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const beforeState: ResourceState = new Map([['some-other-file', '<?php']])

      await (cmd as unknown as PushWithPushFile).pushFile(file, beforeState)

      expect(put).toHaveBeenCalledWith('loopress/v1/api-files', {content: file.content, filename: file.filename})
    })

    it('sends expectedRevision as the sha256 of the remote content already read into beforeState (#234)', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({filename: 'hello'})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const remoteContent = '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello { public function get(): array { return []; } }\n'
      const beforeState: ResourceState = new Map([['hello', remoteContent]])

      await (cmd as unknown as PushWithPushFile).pushFile(file, beforeState)

      expect(put).toHaveBeenCalledWith('loopress/v1/api-files', {
        content: file.content,
        expectedRevision: sha256(remoteContent),
        filename: file.filename,
      })
    })

    it('surfaces a 412 refusal (a stale revision) the same way as any other push failure', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('Request failed (412) on .../api-files: "hello.php" changed on WordPress since it was last read.'))
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const beforeState: ResourceState = new Map([['hello', 'old content']])
      const task = {output: ''}

      await expect((cmd as unknown as PushWithPushFile).pushFile(file, beforeState, task)).rejects.toThrow('412')

      expect(task.output).toBe('Failed to push hello: Request failed (412) on .../api-files: "hello.php" changed on WordPress since it was last read.')
      expect((cmd as unknown as PushWithPushFile).failedCount).toBe(1)
    })

    it("surfaces the server's public flag so run() can warn about an unauthenticated route", async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({filename: 'hello', public: true})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}

      const result = await (cmd as unknown as PushWithPushFile).pushFile(file, undefined)

      expect(result?.public).toBe(true)
    })

    it('does nothing in dry-run mode', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}

      const result = await (cmd as unknown as PushWithPushFile).pushFile(file, undefined, task)

      expect(put).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
      expect(task.output).toBe('[dry-run] Would push: hello')
    })

    it('does nothing in dry-run mode when called with no task (does not crash writing to it)', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}

      const result = await (cmd as unknown as PushWithPushFile).pushFile(file, undefined)

      expect(put).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('reports a normal push in task.output, not the "syntax check skipped" wording', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({filename: 'hello'})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}

      await (cmd as unknown as PushWithPushFile).pushFile(file, undefined, task)

      expect(task.output).toBe('Pushed: hello')
    })

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
      const invalidFile: ApiFile = {content: '<?php', filename: 'WITH_MAJ_ENDPOINT'}

      await expect((cmd as unknown as PushWithPushFile).pushFile(invalidFile, undefined, task)).rejects.toThrow(
        'Invalid filename "WITH_MAJ_ENDPOINT"',
      )

      expect(put).not.toHaveBeenCalled()
      expect(task.output).toContain('Invalid filename "WITH_MAJ_ENDPOINT"')
      expect((cmd as unknown as PushWithPushFile).failedCount).toBe(1)
    })

    it('accepts a nested filename with a dynamic segment', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({filename: 'invoice-pdf/[order_id]'})
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const dynamicFile: ApiFile = {
        content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class InvoicePdf_OrderId {}\n',
        filename: 'invoice-pdf/[order_id]',
      }

      await (cmd as unknown as PushWithPushFile).pushFile(dynamicFile, undefined)

      expect(put).toHaveBeenCalledWith('loopress/v1/api-files', {
        content: dynamicFile.content,
        filename: 'invoice-pdf/[order_id]',
      })
    })

    it('rejects a dynamic segment starting with a digit, mirroring the server rule', async () => {
      // Regression for the QA 7th-pass MEDIUM finding: the client pattern used to accept
      // any \w+ inside brackets, including a leading digit, while the server (matching
      // RouteLoader::DYNAMIC_SEGMENT_PATTERN, whose comment explains why: a leading digit
      // makes preg_match()'s named group silently fail) only ever allowed [A-Za-z_]\w*. A
      // mismatch here just means an avoidable round trip, not a security issue, but the
      // client's own comment promises "mirrors the server's own allowlist".
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}
      const invalidFile: ApiFile = {content: '<?php', filename: 'badseg/[1bad]'}

      await expect((cmd as unknown as PushWithPushFile).pushFile(invalidFile, undefined, task)).rejects.toThrow(
        'Invalid filename "badseg/[1bad]"',
      )

      expect(put).not.toHaveBeenCalled()
    })

    it('rejects a filename attempting path traversal, without calling the API', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}
      const traversalFile: ApiFile = {content: '<?php', filename: 'invoice-pdf/..'}

      await expect((cmd as unknown as PushWithPushFile).pushFile(traversalFile, undefined, task)).rejects.toThrow(
        'Invalid filename "invoice-pdf/.."',
      )

      expect(put).not.toHaveBeenCalled()
    })

    it('rejects a file missing declare(strict_types=1);, without calling the API', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushFile).wpClient = {put}
      const task = {output: ''}
      const missingDeclare: ApiFile = {content: '<?php\nfinal class Hello {}\n', filename: 'hello'}

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
      const duplicateDeclare: ApiFile = {
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

  describe('prune', () => {
    function makePrune({dryRun = false, yes = false} = {}) {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const internals = cmd as unknown as PushWithPrune
      internals.dryRun = dryRun
      internals.yes = yes
      internals.siteConfig = makeEnv('production', 'https://acme.com')
      const get = vi.fn()
      const del = vi.fn().mockResolvedValue({deleted: true})
      internals.wpClient = {delete: del, get}
      return {cmd: internals, del, get, logs}
    }

    beforeEach(() => {
      confirm.mockReset()
      interactive.value = true
    })

    it('deletes every server-side file with no local counterpart, after confirmation', async () => {
      confirm.mockResolvedValue(true)
      const {cmd, del, get} = makePrune()
      get.mockResolvedValue([{filename: 'keep'}, {filename: 'stale-a'}, {filename: 'stale-b'}])

      const pruned = await cmd.prune(new Set(['keep']))

      expect(get).toHaveBeenCalledWith('loopress/v1/api-files')
      expect(del).toHaveBeenCalledWith('loopress/v1/api-files?filename=stale-a')
      expect(del).toHaveBeenCalledWith('loopress/v1/api-files?filename=stale-b')
      expect(del).not.toHaveBeenCalledWith('loopress/v1/api-files?filename=keep')
      expect(pruned).toEqual(['stale-a', 'stale-b'])
      expect(confirm).toHaveBeenCalledWith({default: false, message: expect.stringContaining('stale-a, stale-b')})
    })

    it('does nothing when every server-side file is present locally', async () => {
      const {cmd, del, get} = makePrune()
      get.mockResolvedValue([{filename: 'keep'}])

      const pruned = await cmd.prune(new Set(['keep']))

      expect(del).not.toHaveBeenCalled()
      expect(pruned).toEqual([])
    })

    it('keeps the server-side files when the confirmation is declined', async () => {
      confirm.mockResolvedValue(false)
      const {cmd, del, get} = makePrune()
      get.mockResolvedValue([{filename: 'stale'}])

      const pruned = await cmd.prune(new Set())

      expect(del).not.toHaveBeenCalled()
      expect(pruned).toEqual([])
    })

    it('refuses to prune in a non-TTY without --yes', async () => {
      interactive.value = false
      const {cmd, del, get} = makePrune()
      get.mockResolvedValue([{filename: 'stale'}])

      await expect(cmd.prune(new Set())).rejects.toThrow(/--prune would delete .* not a TTY/s)
      expect(del).not.toHaveBeenCalled()
    })

    it('prunes without prompting when --yes is set', async () => {
      const {cmd, del, get} = makePrune({yes: true})
      get.mockResolvedValue([{filename: 'stale'}])

      await cmd.prune(new Set())

      expect(confirm).not.toHaveBeenCalled()
      expect(del).toHaveBeenCalledWith('loopress/v1/api-files?filename=stale')
    })

    it('reports what it would prune on --dry-run without deleting anything', async () => {
      const {cmd, del, get, logs} = makePrune({dryRun: true})
      get.mockResolvedValue([{filename: 'stale'}])

      const pruned = await cmd.prune(new Set())

      expect(del).not.toHaveBeenCalled()
      expect(pruned).toEqual(['stale'])
      expect(logs.log).toHaveBeenCalledWith(expect.stringMatching(/^\[dry-run\] Would prune .*stale/))
    })
  })
})
