import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/api/pull.js'
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

// The same matcher `api pull` wires in run(): `<filename>.php`, the whole basename is the key,
// recursive since a path-param route file can live in a subdirectory.
async function findOrphanedFiles(path: string, keepFilenames: Set<string>): Promise<string[]> {
  return findOrphanedFilesLib(path, keepFilenames, {extensions: ['.php'], key: basenameKey, recursive: true})
}

describe('api pull', () => {
  describe('findOrphanedFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-api-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds a .php file whose route no longer exists remotely', async () => {
      writeFileSync(join(dir, 'gone.php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual(['gone.php'])
    })

    it('keeps a file whose filename is still in the current remote list', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set(['hello']))

      expect(orphans).toEqual([])
    })

    it('ignores unrelated non-.php files in the api directory', async () => {
      writeFileSync(join(dir, 'README.md'), '# notes')
      writeFileSync(join(dir, '.DS_Store'), '')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('returns an empty list when the api directory does not exist yet', async () => {
      const orphans = await findOrphanedFiles(join(dir, 'does-not-exist'), new Set())

      expect(orphans).toEqual([])
    })

    it('finds a nested .php file whose route no longer exists remotely', async () => {
      mkdirSync(join(dir, 'invoice-pdf'), {recursive: true})
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set())

      // Hardcoded '/', not join(): the server always sends filenames with '/', regardless of
      // the OS this runs on, a join()-built expectation would tautologically pass either way.
      expect(orphans).toEqual(['invoice-pdf/[order_id].php'])
    })

    it('keeps a nested file whose filename is still in the current remote list', async () => {
      mkdirSync(join(dir, 'invoice-pdf'), {recursive: true})
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), '<?php')

      // The keep set as the server would actually send it: always '/', never the OS separator.
      const orphans = await findOrphanedFiles(dir, new Set(['invoice-pdf/[order_id]']))

      expect(orphans).toEqual([])
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
      dir = mkdtempSync(join(tmpdir(), 'lps-api-pull-run-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('fetches loopress/v1/api-files and logs the banner lines', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/api-files')
      expect(logs.log).toHaveBeenCalledWith('Pulling API routes from https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`API path: ${dir}`)
    })

    it('writes each route to <filename>.php, creating nested directories for path-param routes', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([
        {content: '<?php echo 1;', filename: 'hello'},
        {content: '<?php echo 2;', filename: 'invoice-pdf/[order_id]'},
      ])

      const result = await cmd.run()

      expect(readFileSync(join(dir, 'hello.php'), 'utf8')).toBe('<?php echo 1;')
      expect(readFileSync(join(dir, 'invoice-pdf', '[order_id].php'), 'utf8')).toBe('<?php echo 2;')
      expect(titlesOf(0)).toEqual(['Pull hello', 'Pull invoice-pdf/[order_id]'])
      expect(outputsOf(0)).toEqual(['Pulled: hello', 'Pulled: invoice-pdf/[order_id]'])
      expect(logs.log).toHaveBeenCalledWith('Pulled 2 route files to ' + dir)
      expect(result).toEqual({orphans: [], pulled: ['hello', 'invoice-pdf/[order_id]'], status: 'success'})
    })

    it('uses the singular "route file" wording for exactly one file', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([{content: '<?php', filename: 'hello'}])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('Pulled 1 route file to ' + dir)
    })

    it('creates the api directory even when there is nothing to pull', async () => {
      const {cmd, get} = make(false, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(existsSync(dir)).toBe(true)
    })

    it('wires removeOrphanedFiles with the path, the exact orphan list, and the route-deleted reason', async () => {
      writeFileSync(join(dir, 'gone.php'), '<?php')
      writeFileSync(join(dir, 'hello.php'), '<?php')
      const {cmd, get, internals} = make(false, [dir])
      get.mockResolvedValue([{content: '<?php', filename: 'hello'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles').mockResolvedValue(undefined)

      await cmd.run()

      expect(removeOrphanedFiles).toHaveBeenCalledWith(dir, ['gone.php'], 'whose route no longer exists on WordPress')
    })

    it('does nothing on dry-run: no files written, no removal, and reports the dry-run message', async () => {
      const {cmd, get, internals, logs} = make(true, [dir])
      get.mockResolvedValue([{content: '<?php', filename: 'hello'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles')

      const result = await cmd.run()

      expect(existsSync(join(dir, 'hello.php'))).toBe(false)
      expect(removeOrphanedFiles).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 1 route file to ' + dir)
      expect(result.status).toBe('dry-run')
    })

    it('uses singular wording in the would-remove message for exactly one orphan', async () => {
      writeFileSync(join(dir, 'gone.php'), '<?php')
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would remove 1 local file whose route no longer exists on WordPress: gone.php')
    })

    it('reports would-remove with a comma-separated, pluralized list on dry-run', async () => {
      writeFileSync(join(dir, 'gone-a.php'), '<?php')
      writeFileSync(join(dir, 'gone-b.php'), '<?php')
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(
        `[dry-run] Would remove 2 local files whose route no longer exists on WordPress: gone-a.php, gone-b.php`,
      )
    })

    it('does not log a would-remove line on dry-run when there are no orphans', async () => {
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Would remove'))
    })

    it('pluralizes the "Would pull" message when there is more than one route file', async () => {
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([
        {content: '<?php', filename: 'hello'},
        {content: '<?php', filename: 'world'},
      ])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 2 route files to ' + dir)
    })

    // Regression coverage: the orphan scan must walk subdirectories (a path-param route file
    // like invoice-pdf/[order_id].php lives one level down), a non-recursive scan would never
    // see it and would silently leave it on disk forever.
    it('finds a nested orphan file that no longer has a matching route remotely', async () => {
      mkdirSync(join(dir, 'invoice-pdf'), {recursive: true})
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), '<?php')
      const {cmd, get, internals} = make(false, [dir])
      get.mockResolvedValue([])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles').mockResolvedValue(undefined)

      await cmd.run()

      expect(removeOrphanedFiles).toHaveBeenCalledWith(dir, ['invoice-pdf/[order_id].php'], expect.any(String))
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
