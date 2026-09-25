import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/api/push.js'
import {type ResourceState} from '../../../src/lib/diff-state.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'
import {sha256} from '../../helpers/sha256.js'

const {confirm} = vi.hoisted(() => ({confirm: vi.fn()}))
vi.mock('@inquirer/prompts', () => ({confirm}))

const interactive = vi.hoisted(() => ({value: true}))
vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => interactive.value}))

type ApiFile = {
  content: string
  filename: string
}

type BatchPushResult = {
  files: Array<{filename: string; public?: boolean; syntax_check?: 'skipped'}>
  pruned: string[]
}

type PushWithLoadFiles = {loadFiles(path: string): Promise<ApiFile[]>}
type PushWithValidateFileLocally = {
  failedCount: number
  validateFileLocally(file: ApiFile, task?: {output: string}): void
}
type PushWithPushBatch = {
  pushBatch(
    files: ApiFile[],
    pruneList: string[],
    beforeState: ResourceState | undefined,
  ): Promise<{pruned: string[]; pushed: string[]}>
  siteConfig: EnvironmentConfig
  wpClient: {post: ReturnType<typeof vi.fn>}
}
type PushWithResolvePruneList = {
  dryRun: boolean
  resolvePruneList(localFilenames: Set<string>): Promise<string[]>
  siteConfig: EnvironmentConfig
  wpClient: {get: ReturnType<typeof vi.fn>}
  yes: boolean
}

async function loadFiles(path: string): Promise<ApiFile[]> {
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

  describe('validateFileLocally', () => {
    const file: ApiFile = {content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n', filename: 'hello'}

    it('accepts a well-formed file and reports it in task.output', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const task = {output: ''}

      ;(cmd as unknown as PushWithValidateFileLocally).validateFileLocally(file, task)

      expect(task.output).toBe('Validated: hello')
      expect((cmd as unknown as PushWithValidateFileLocally).failedCount).toBe(0)
    })

    it('rejects a filename the server route would never match, without calling the API', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const task = {output: ''}
      const invalidFile: ApiFile = {content: '<?php', filename: 'WITH_MAJ_ENDPOINT'}

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(invalidFile, task); }).toThrow(
        'Invalid filename "WITH_MAJ_ENDPOINT"',
      )

      expect(task.output).toContain('Invalid filename "WITH_MAJ_ENDPOINT"')
      expect((cmd as unknown as PushWithValidateFileLocally).failedCount).toBe(1)
    })

    it('accepts a nested filename with a dynamic segment', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const dynamicFile: ApiFile = {
        content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class InvoicePdf_OrderId {}\n',
        filename: 'invoice-pdf/[order_id]',
      }

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(dynamicFile); }).not.toThrow()
    })

    it('rejects a root index file, mirroring the server rule', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const rootIndex: ApiFile = {content: '<?php', filename: 'index'}

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(rootIndex); }).toThrow(
        'Invalid filename "index"',
      )
    })

    it('accepts a nested index file', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const nestedIndex: ApiFile = {
        content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class Orders {}\n',
        filename: 'orders/index',
      }

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(nestedIndex); }).not.toThrow()
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
      const invalidFile: ApiFile = {content: '<?php', filename: 'badseg/[1bad]'}

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(invalidFile); }).toThrow(
        'Invalid filename "badseg/[1bad]"',
      )
    })

    it('rejects a filename attempting path traversal', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const traversalFile: ApiFile = {content: '<?php', filename: 'invoice-pdf/..'}

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(traversalFile); }).toThrow(
        'Invalid filename "invoice-pdf/.."',
      )
    })

    it('rejects a file missing declare(strict_types=1);', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const missingDeclare: ApiFile = {content: '<?php\nfinal class Hello {}\n', filename: 'hello'}

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(missingDeclare); }).toThrow(
        'declare(strict_types=1);" is missing',
      )
      expect((cmd as unknown as PushWithValidateFileLocally).failedCount).toBe(1)
    })

    it('rejects a file with declare(strict_types=1); appearing more than once', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const duplicateDeclare: ApiFile = {
        content: '<?php\ndeclare(strict_types=1);\ndeclare(strict_types=1);\nfinal class Hello {}\n',
        filename: 'hello',
      }

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(duplicateDeclare); }).toThrow(
        'declare(strict_types=1);" appears more than once',
      )
      expect((cmd as unknown as PushWithValidateFileLocally).failedCount).toBe(1)
    })
  })

  describe('pushBatch', () => {
    const file: ApiFile = {content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n', filename: 'hello'}

    function makePushBatch() {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const internals = cmd as unknown as PushWithPushBatch
      internals.siteConfig = makeEnv('production', 'https://acme.com')
      const post = vi.fn<(...args: unknown[]) => Promise<BatchPushResult>>().mockResolvedValue({files: [{filename: 'hello'}], pruned: []})
      internals.wpClient = {post}
      return {cmd: internals, post}
    }

    it('POSTs to loopress/v1/api-files/batch with every file and the prune list in one body', async () => {
      const {cmd, post} = makePushBatch()

      await cmd.pushBatch([file], ['stale'], undefined)

      expect(post).toHaveBeenCalledWith('loopress/v1/api-files/batch', {
        files: [{content: file.content, filename: file.filename}],
        prune: ['stale'],
      })
    })

    it('omits expectedRevision when beforeState has no entry for the file (a first push, #234)', async () => {
      const {cmd, post} = makePushBatch()
      const beforeState: ResourceState = new Map([['some-other-file', '<?php']])

      await cmd.pushBatch([file], [], beforeState)

      expect(post).toHaveBeenCalledWith(
        'loopress/v1/api-files/batch',
        expect.objectContaining({files: [{content: file.content, filename: file.filename}]}),
      )
    })

    it('sends expectedRevision as the sha256 of the remote content already read into beforeState (#234)', async () => {
      const {cmd, post} = makePushBatch()
      const remoteContent = '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello { public function get(): array { return []; } }\n'
      const beforeState: ResourceState = new Map([['hello', remoteContent]])

      await cmd.pushBatch([file], [], beforeState)

      expect(post).toHaveBeenCalledWith('loopress/v1/api-files/batch', {
        files: [{content: file.content, expectedRevision: sha256(remoteContent), filename: file.filename}],
        prune: [],
      })
    })

    it('surfaces a 412 refusal (a stale revision) as a whole-batch failure, nothing changed', async () => {
      const {cmd, post} = makePushBatch()
      post.mockRejectedValueOnce(
        new Error('Request failed (412) on .../api-files/batch: "hello.php" changed on WordPress since it was last read.'),
      )
      const beforeState: ResourceState = new Map([['hello', 'old content']])

      await expect(cmd.pushBatch([file], [], beforeState)).rejects.toThrow(
        'Push failed, nothing was changed on https://acme.com',
      )
    })

    it("surfaces the server's public flag for each pushed file", async () => {
      const {cmd, post} = makePushBatch()
      post.mockResolvedValueOnce({files: [{filename: 'hello', public: true}], pruned: []})

      const result = await cmd.pushBatch([file], [], undefined)

      expect(result.pushed).toEqual(['hello'])
    })

    it('returns the pushed and pruned filenames the server reports', async () => {
      const {cmd, post} = makePushBatch()
      post.mockResolvedValueOnce({files: [{filename: 'hello'}], pruned: ['stale']})

      const result = await cmd.pushBatch([file], ['stale'], undefined)

      expect(result).toEqual({pruned: ['stale'], pushed: ['hello']})
    })
  })

  describe('resolvePruneList', () => {
    function makeResolvePruneList({dryRun = false, yes = false} = {}) {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const internals = cmd as unknown as PushWithResolvePruneList
      internals.dryRun = dryRun
      internals.yes = yes
      internals.siteConfig = makeEnv('production', 'https://acme.com')
      const get = vi.fn()
      internals.wpClient = {get}
      return {cmd: internals, get, logs}
    }

    beforeEach(() => {
      confirm.mockReset()
      interactive.value = true
    })

    it('lists every server-side file with no local counterpart, after confirmation', async () => {
      confirm.mockResolvedValue(true)
      const {cmd, get} = makeResolvePruneList()
      get.mockResolvedValue([{filename: 'keep'}, {filename: 'stale-a'}, {filename: 'stale-b'}])

      const pruned = await cmd.resolvePruneList(new Set(['keep']))

      expect(get).toHaveBeenCalledWith('loopress/v1/api-files')
      expect(pruned).toEqual(['stale-a', 'stale-b'])
      expect(confirm).toHaveBeenCalledWith({default: false, message: expect.stringContaining('stale-a, stale-b')})
    })

    it('does nothing when every server-side file is present locally', async () => {
      const {cmd, get} = makeResolvePruneList()
      get.mockResolvedValue([{filename: 'keep'}])

      const pruned = await cmd.resolvePruneList(new Set(['keep']))

      expect(confirm).not.toHaveBeenCalled()
      expect(pruned).toEqual([])
    })

    it('keeps the server-side files when the confirmation is declined', async () => {
      confirm.mockResolvedValue(false)
      const {cmd, get} = makeResolvePruneList()
      get.mockResolvedValue([{filename: 'stale'}])

      const pruned = await cmd.resolvePruneList(new Set())

      expect(pruned).toEqual([])
    })

    it('refuses to prune in a non-TTY without --yes', async () => {
      interactive.value = false
      const {cmd, get} = makeResolvePruneList()
      get.mockResolvedValue([{filename: 'stale'}])

      await expect(cmd.resolvePruneList(new Set())).rejects.toThrow(/--prune would delete .* not a TTY/s)
    })

    it('lists the orphans without prompting when --yes is set', async () => {
      const {cmd, get} = makeResolvePruneList({yes: true})
      get.mockResolvedValue([{filename: 'stale'}])

      const pruned = await cmd.resolvePruneList(new Set())

      expect(confirm).not.toHaveBeenCalled()
      expect(pruned).toEqual(['stale'])
    })

    it('reports what it would prune on --dry-run', async () => {
      const {cmd, get, logs} = makeResolvePruneList({dryRun: true})
      get.mockResolvedValue([{filename: 'stale'}])

      const pruned = await cmd.resolvePruneList(new Set())

      expect(pruned).toEqual(['stale'])
      expect(logs.log).toHaveBeenCalledWith(expect.stringMatching(/^\[dry-run\] Would prune .*stale/))
    })
  })
})
