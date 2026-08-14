import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/acf/pull.js'
import {basenameKey, findOrphanedFiles as findOrphanedFilesLib} from '../../../src/lib/find-orphaned-files.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {outputsOf, resetListrInstances, titlesOf} from '../../helpers/listr.js'
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

// The same matcher `acf pull` wires in pullType(): `<key>.json`, the whole basename is the key.
async function findOrphanedFiles(dir: string, keepKeys: Set<string>): Promise<string[]> {
  return findOrphanedFilesLib(dir, keepKeys, {extensions: ['.json'], key: basenameKey})
}

describe('acf pull helpers', () => {
  describe('findOrphanedFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-acf-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds a file whose key is no longer present remotely', async () => {
      writeFileSync(join(dir, 'post_type_123.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual(['post_type_123.json'])
    })

    it('keeps a file whose key is still in the current remote list', async () => {
      writeFileSync(join(dir, 'group_abc.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set(['group_abc']))

      expect(orphans).toEqual([])
    })

    it('ignores non-.json files', async () => {
      writeFileSync(join(dir, 'README.md'), '# notes')
      writeFileSync(join(dir, '.DS_Store'), '')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('returns an empty list when the directory does not exist yet', async () => {
      const orphans = await findOrphanedFiles(join(dir, 'does-not-exist'), new Set())

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
      dir = mkdtempSync(join(tmpdir(), 'lps-acf-pull-run-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('pulls every ACF object type by default, one request per type', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/acf/field-groups')
      expect(get).toHaveBeenCalledWith('loopress/v1/acf/post-types')
      expect(get).toHaveBeenCalledWith('loopress/v1/acf/taxonomies')
      expect(get).toHaveBeenCalledWith('loopress/v1/acf/options-pages')
      expect(get).toHaveBeenCalledTimes(4)
      expect(logs.log).toHaveBeenCalledWith('Pulling ACF configuration from https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`ACF path: ${dir}`)
    })

    it('limits to the requested type when --type is given', async () => {
      const {cmd, get} = make(false, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([])

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/acf/field-groups')
      expect(get).toHaveBeenCalledTimes(1)
    })

    it('writes each object to <key>.json under the type subdirectory, and reports the Listr title/output', async () => {
      const {cmd, get, logs} = make(false, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([{key: 'group_1', title: 'One'}])

      await cmd.run()

      const raw = readFileSync(join(dir, 'field-groups', 'group_1.json'), 'utf8')
      expect(JSON.parse(raw)).toEqual({key: 'group_1', title: 'One'})
      expect(raw.endsWith('\n')).toBe(true)
      expect(titlesOf(0)).toEqual(['Pull group_1'])
      expect(outputsOf(0)).toEqual(['Pulled: group_1'])
      expect(logs.log).toHaveBeenCalledWith('Pulled 1 field-groups to ' + join(dir, 'field-groups'))
    })

    it('does not create the type directory when there is nothing to pull', async () => {
      const {cmd, get} = make(false, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([])

      await cmd.run()

      expect(existsSync(join(dir, 'field-groups'))).toBe(false)
    })

    it('skips items with no key and warns with the exact count, without writing them', async () => {
      const {cmd, get, logs} = make(false, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([{key: 'group_1', title: 'One'}, {title: 'No key'}])

      await cmd.run()

      expect(logs.warn).toHaveBeenCalledWith('1 field-groups skipped because they have no key')
      expect(existsSync(join(dir, 'field-groups', 'group_1.json'))).toBe(true)
    })

    it('does not warn about skipped items when every item has a key', async () => {
      const {cmd, get, logs} = make(false, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([{key: 'group_1', title: 'One'}])

      await cmd.run()

      expect(logs.warn).not.toHaveBeenCalled()
    })

    it('wires removeOrphanedFiles with the type directory, the exact orphan list, and the reason', async () => {
      const {cmd, get, internals} = make(false, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([{key: 'group_1', title: 'One'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles').mockResolvedValue(undefined)

      await cmd.run()

      expect(removeOrphanedFiles).toHaveBeenCalledWith(join(dir, 'field-groups'), [], `in ${join(dir, 'field-groups')} no longer present on WordPress`)
    })

    it('passes the actual orphaned files (keyed by basename) to removeOrphanedFiles, keeping the one still present remotely', async () => {
      const typeDir = join(dir, 'field-groups')
      const {mkdirSync} = await import('node:fs')
      mkdirSync(typeDir, {recursive: true})
      // A stale local file no longer on WordPress, and one whose key IS still in the remote
      // list: this second file proves the keep-set is built from the real remote keys, not
      // an empty/undefined set that would wrongly flag it as orphaned too.
      writeFileSync(join(typeDir, 'group_gone.json'), '{}')
      writeFileSync(join(typeDir, 'group_1.json'), '{"stale": true}')
      const {cmd, get, internals} = make(false, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([{key: 'group_1', title: 'One'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles').mockImplementation(async () => {})

      await cmd.run()

      expect(removeOrphanedFiles).toHaveBeenCalledWith(typeDir, ['group_gone.json'], expect.stringContaining('no longer present on WordPress'))
    })

    it('does nothing on dry-run: no directory created, no items written, no removal', async () => {
      const {cmd, get, internals, logs} = make(true, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([{key: 'group_1', title: 'One'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles')

      await cmd.run()

      expect(existsSync(join(dir, 'field-groups'))).toBe(false)
      expect(removeOrphanedFiles).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 1 field-groups to ' + join(dir, 'field-groups'))
    })

    it('reports what would be removed on dry-run when orphans exist, without deleting anything', async () => {
      const typeDir = join(dir, 'field-groups')
      const {mkdirSync} = await import('node:fs')
      mkdirSync(typeDir, {recursive: true})
      writeFileSync(join(typeDir, 'group_gone.json'), '{}')
      const {cmd, get, logs} = make(true, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(
        `[dry-run] Would remove 1 local file in ${typeDir} no longer present on WordPress: group_gone.json`,
      )
      expect(existsSync(join(typeDir, 'group_gone.json'))).toBe(true)
    })

    it('pluralizes and comma-separates the dry-run removal message for more than one orphan', async () => {
      const typeDir = join(dir, 'field-groups')
      const {mkdirSync} = await import('node:fs')
      mkdirSync(typeDir, {recursive: true})
      writeFileSync(join(typeDir, 'group_a.json'), '{}')
      writeFileSync(join(typeDir, 'group_b.json'), '{}')
      const {cmd, get, logs} = make(true, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(
        `[dry-run] Would remove 2 local files in ${typeDir} no longer present on WordPress: group_a.json, group_b.json`,
      )
    })

    it('does not log a would-remove line on dry-run when there are no orphans', async () => {
      const {cmd, get, logs} = make(true, [dir, '--type', 'field-groups'])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Would remove'))
    })
  })
})
