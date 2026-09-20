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

type BatchPushResult = {
  files: Array<{filename: string; public?: boolean; syntax_check?: 'skipped'}>
  pruned: string[]
}

type PushWithLoadFiles = {loadFiles(path: string): Promise<HookFile[]>}
type PushWithValidateFileLocally = {
  failedCount: number
  validateFileLocally(file: HookFile, task?: {output: string}): void
}
type PushWithPushBatch = {
  pushBatch(
    files: HookFile[],
    pruneList: string[],
    beforeState: ResourceState | undefined,
  ): Promise<{pruned: string[]; pushed: string[]}>
  siteConfig: EnvironmentConfig
  wpClient: {post: ReturnType<typeof vi.fn>}
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

  describe('validateFileLocally', () => {
    const file: HookFile = {content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n', filename: 'hello'}

    it('accepts a well-formed file and reports it in task.output', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const task = {output: ''}

      ;(cmd as unknown as PushWithValidateFileLocally).validateFileLocally(file, task)

      expect(task.output).toBe('Validated: hello')
    })

    it('rejects a filename the server route would never match', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const task = {output: ''}
      const invalidFile: HookFile = {content: '<?php', filename: 'WITH_MAJ_HOOK'}

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(invalidFile, task); }).toThrow(
        'Invalid filename "WITH_MAJ_HOOK"',
      )

      expect(task.output).toContain('Invalid filename "WITH_MAJ_HOOK"')
      expect((cmd as unknown as PushWithValidateFileLocally).failedCount).toBe(1)
    })

    it('accepts a nested filename', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const nestedFile: HookFile = {
        content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class ContentFilters {}\n',
        filename: 'content/filters',
      }

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(nestedFile); }).not.toThrow()
    })

    it('rejects a filename attempting path traversal', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const traversalFile: HookFile = {content: '<?php', filename: 'content/..'}

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(traversalFile); }).toThrow(
        'Invalid filename "content/.."',
      )
    })

    it('rejects a file missing declare(strict_types=1);', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const missingDeclare: HookFile = {content: '<?php\nfinal class Hello {}\n', filename: 'hello'}

      expect(() => { (cmd as unknown as PushWithValidateFileLocally).validateFileLocally(missingDeclare); }).toThrow(
        'declare(strict_types=1);" is missing',
      )
      expect((cmd as unknown as PushWithValidateFileLocally).failedCount).toBe(1)
    })

    it('rejects a file with declare(strict_types=1); appearing more than once', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const duplicateDeclare: HookFile = {
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
    // The full expectedRevision/public/syntax_check-skipped/412-failure matrix lives once in
    // api/push.test.ts: pushBatch() here is the exact same shared resourcePushCommand() factory
    // code, not a reimplementation. This is a smoke test that hook wires into the same shared
    // code with its own endpoint; the end-to-end run() test below covers the rest.
    it('POSTs to loopress/v1/hook-files/batch with the filename and raw content in the body', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const internals = cmd as unknown as PushWithPushBatch
      internals.siteConfig = makeEnv('production', 'https://acme.com')
      const post = vi.fn<(...args: unknown[]) => Promise<BatchPushResult>>().mockResolvedValue({files: [{filename: 'hello'}], pruned: []})
      internals.wpClient = {post}
      const file: HookFile = {content: '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n', filename: 'hello'}

      await internals.pushBatch([file], [], undefined)

      expect(post).toHaveBeenCalledWith('loopress/v1/hook-files/batch', {
        files: [{content: file.content, filename: file.filename}],
        prune: [],
      })
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
      const post = vi.fn<(...args: unknown[]) => Promise<BatchPushResult>>().mockResolvedValue({files: [{filename: 'hello'}], pruned: []})
      const get = vi.fn().mockResolvedValue([])
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, post}
      return {cmd, get, logs, post}
    }

    it('pushes every local file in one atomic batch request, logs the banner and found count, and reports success', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n')
      const {cmd, logs, post} = make([dir])

      const result = await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('Pushing hooks to https://acme.com')
      expect(logs.log).toHaveBeenCalledWith('Found 1 hook file to push')
      expect(post).toHaveBeenCalledWith(
        'loopress/v1/hook-files/batch',
        expect.objectContaining({files: [expect.objectContaining({filename: 'hello'})]}),
      )
      expect(logs.log).toHaveBeenCalledWith('All hooks pushed.')
      expect(result).toEqual({pruned: [], pushed: ['hello'], status: 'success'})
    })

    it('sends expectedRevision end to end, computed from the remote listing read for the rollback snapshot (#234)', async () => {
      const remoteContent = '<?php\n\ndeclare(strict_types=1);\n\nfinal class OldHello {}\n'
      writeFileSync(join(dir, 'hello.php'), '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n')
      const {cmd, get, post} = make([dir])
      get.mockResolvedValue([{content: remoteContent, filename: 'hello'}])

      await cmd.run()

      expect(post).toHaveBeenCalledWith(
        'loopress/v1/hook-files/batch',
        expect.objectContaining({files: [expect.objectContaining({expectedRevision: sha256(remoteContent), filename: 'hello'})]}),
      )
    })

    it('errors with the failed count, before ever calling the API, when a local file fails validation', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php\nfinal class Hello {}\n') // missing declare(strict_types=1);
      const {cmd, post} = make([dir])

      await expect(cmd.run()).rejects.toThrow(/1 hook file.*failed to push/)
      expect(post).not.toHaveBeenCalled()
    })

    it('errors, nothing changed, when the batch request itself fails', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n')
      const {cmd, post} = make([dir])
      post.mockRejectedValue(new Error('boom'))

      await expect(cmd.run()).rejects.toThrow('Push failed, nothing was changed on https://acme.com: boom')
    })

    it('does not push anything on a dry run, and reports dry-run status', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello {}\n')
      const {cmd, post} = make([dir])
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true

      const result = await cmd.run()

      expect(post).not.toHaveBeenCalled()
      expect(result.status).toBe('dry-run')
    })

    it('prunes server-side files not present locally as part of the same atomic batch when --prune is passed', async () => {
      const {cmd, get, logs, post} = make([dir, '--prune'])
      ;(cmd as unknown as {yes: boolean}).yes = true
      get.mockResolvedValue([{filename: 'stale'}])
      post.mockResolvedValue({files: [], pruned: ['stale']})

      const result = await cmd.run()

      expect(post).toHaveBeenCalledWith('loopress/v1/hook-files/batch', expect.objectContaining({prune: ['stale']}))
      expect(result.pruned).toEqual(['stale'])
      expect(logs.log).toHaveBeenCalledWith('Pruned: stale')
    })
  })
})
