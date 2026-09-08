import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/hook/pull.js'
import {basenameKey, findOrphanedFiles as findOrphanedFilesLib} from '../../../src/lib/find-orphaned-files.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {listrInstances, outputsOf, resetListrInstances, titlesOf} from '../../helpers/listr.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('listr2', async () => {
  const {createListrMock} = await import('../../helpers/listr.js')
  return createListrMock()
})

type PullInternals = {
  dryRun: boolean
  localConfig: LoopressLocalConfig
  removeOrphanedFiles(dir: string, orphans: string[], reason: string): Promise<void>
  siteConfig: EnvironmentConfig
  wpClient: {get: ReturnType<typeof vi.fn>}
}

// The same matcher `hook pull` wires in run(): `<filename>.php`, the whole basename is the
// key, recursive since a nested hook file can live in a subdirectory.
async function findOrphanedFiles(path: string, keepFilenames: Set<string>): Promise<string[]> {
  return findOrphanedFilesLib(path, keepFilenames, {extensions: ['.php'], key: basenameKey, recursive: true})
}

describe('hook pull', () => {
  describe('findOrphanedFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-hook-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds a .php file no longer present remotely', async () => {
      writeFileSync(join(dir, 'gone.php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual(['gone.php'])
    })

    it('keeps a file whose filename is still in the current remote list', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set(['hello']))

      expect(orphans).toEqual([])
    })

    it('ignores unrelated non-.php files in the hooks directory', async () => {
      writeFileSync(join(dir, 'README.md'), '# notes')
      writeFileSync(join(dir, '.DS_Store'), '')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('returns an empty list when the hooks directory does not exist yet', async () => {
      const orphans = await findOrphanedFiles(join(dir, 'does-not-exist'), new Set())

      expect(orphans).toEqual([])
    })

    it('finds a nested .php file no longer present remotely', async () => {
      mkdirSync(join(dir, 'content'), {recursive: true})
      writeFileSync(join(dir, 'content', 'filters.php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual(['content/filters.php'])
    })
  })

  describe('run', () => {
    let dir: string

    function make(dryRun: boolean, argv: string[]) {
      const cmd = new Pull(argv, fakeOclifConfig)
      const internals = cmd as unknown as PullInternals
      internals.dryRun = dryRun
      internals.localConfig = {}
      internals.siteConfig = makeEnv('production', 'https://acme.com')
      const logs = silenceLogs(cmd)
      const get = vi.fn()
      internals.wpClient = {get}
      return {cmd, get, internals, logs}
    }

    beforeEach(() => {
      resetListrInstances()
      dir = mkdtempSync(join(tmpdir(), 'lps-hook-pull-run-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('fetches loopress/v1/hook-files and logs the banner lines', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/hook-files')
      expect(logs.log).toHaveBeenCalledWith('Pulling hooks from https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`Hooks path: ${dir}`)
    })

    it('writes each file to <filename>.php, creating nested directories for a nested slug', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([
        {content: '<?php echo 1;', filename: 'hello'},
        {content: '<?php echo 2;', filename: 'content/filters'},
      ])

      const result = await cmd.run()

      expect(readFileSync(join(dir, 'hello.php'), 'utf8')).toBe('<?php echo 1;')
      expect(readFileSync(join(dir, 'content', 'filters.php'), 'utf8')).toBe('<?php echo 2;')
      expect(titlesOf(0)).toEqual(['Pull hello', 'Pull content/filters'])
      expect(outputsOf(0)).toEqual(['Pulled: hello', 'Pulled: content/filters'])
      expect(logs.log).toHaveBeenCalledWith('Pulled 2 hook files to ' + dir)
      expect(result).toEqual({orphans: [], pulled: ['hello', 'content/filters'], status: 'success'})
    })

    it('uses the singular "hook file" wording for exactly one file', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([{content: '<?php', filename: 'hello'}])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('Pulled 1 hook file to ' + dir)
    })

    it('creates the hooks directory even when there is nothing to pull', async () => {
      const {cmd, get} = make(false, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(existsSync(dir)).toBe(true)
    })

    it('wires removeOrphanedFiles with the path, the exact orphan list, and the no-longer-present reason', async () => {
      writeFileSync(join(dir, 'gone.php'), '<?php')
      writeFileSync(join(dir, 'hello.php'), '<?php')
      const {cmd, get, internals} = make(false, [dir])
      get.mockResolvedValue([{content: '<?php', filename: 'hello'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles').mockResolvedValue(undefined)

      await cmd.run()

      expect(removeOrphanedFiles).toHaveBeenCalledWith(dir, ['gone.php'], 'no longer present on WordPress')
    })

    it('does nothing on dry-run: no files written, no removal, and reports the dry-run message', async () => {
      const {cmd, get, internals, logs} = make(true, [dir])
      get.mockResolvedValue([{content: '<?php', filename: 'hello'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles')

      const result = await cmd.run()

      expect(existsSync(join(dir, 'hello.php'))).toBe(false)
      expect(removeOrphanedFiles).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 1 hook file to ' + dir)
      expect(result.status).toBe('dry-run')
    })

    it('uses the silent Listr renderer when --json is passed, the default renderer otherwise', async () => {
      const {cmd: jsonCmd, get: jsonGet} = make(false, [dir, '--json'])
      jsonGet.mockResolvedValue([{content: '<?php', filename: 'hello'}])
      await jsonCmd.run()

      expect(listrInstances.at(-1)?.options).toEqual({renderer: 'silent'})

      const {cmd: plainCmd, get: plainGet} = make(false, [dir])
      plainGet.mockResolvedValue([{content: '<?php', filename: 'hello'}])
      await plainCmd.run()

      expect(listrInstances.at(-1)?.options).toEqual({renderer: 'default'})
    })
  })
})
