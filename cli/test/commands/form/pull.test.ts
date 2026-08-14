import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/form/pull.js'
import {findOrphanedFiles as findOrphanedFilesLib, numericPrefixKey} from '../../../src/lib/find-orphaned-files.js'
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

// The same matcher `form pull` wires in run(): forms are single `<id>-<slug>.json` files,
// identity taken from the `<id>-` prefix, same principle as acf pull / page pull.
async function findOrphanedFiles(dir: string, keepIds: Set<string>): Promise<string[]> {
  return findOrphanedFilesLib(dir, keepIds, {extensions: ['.json'], key: numericPrefixKey})
}

describe('form pull', () => {
  describe('findOrphanedFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-form-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds a form file whose id is no longer present remotely', async () => {
      writeFileSync(join(dir, '12-contact.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual(['12-contact.json'])
    })

    it('keeps a file whose id is still in the current remote list', async () => {
      writeFileSync(join(dir, '10-contact.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set(['10']))

      expect(orphans).toEqual([])
    })

    it('never touches a hand-created file with no numeric id prefix', async () => {
      writeFileSync(join(dir, 'demo.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('ignores unrelated files in the forms directory', async () => {
      writeFileSync(join(dir, 'README.md'), '# notes')
      writeFileSync(join(dir, '.DS_Store'), '')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('returns an empty list when the forms directory does not exist yet', async () => {
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
      dir = mkdtempSync(join(tmpdir(), 'lps-form-pull-run-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('fetches loopress/v1/forms and logs the banner lines', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/forms')
      expect(logs.log).toHaveBeenCalledWith('Pulling forms from https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`Forms path: ${dir}`)
    })

    it('writes a form to <id>-<slug>.json and reports the Listr title/output', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([{id: 9, settings: {form_title: 'Contact Us'}}])

      await cmd.run()

      const raw = readFileSync(join(dir, '9-contact-us.json'), 'utf8')
      expect(JSON.parse(raw)).toEqual({id: 9, settings: {form_title: 'Contact Us'}})
      expect(raw.endsWith('\n')).toBe(true)
      expect(titlesOf(0)).toEqual(['Pull Contact Us'])
      expect(outputsOf(0)).toEqual(['Pulled: Contact Us'])
      expect(logs.log).toHaveBeenCalledWith('Pulled 1 form to ' + dir)
    })

    it('uses "(untitled)" and falls back to "untitled" for the slug when a form has no form_title', async () => {
      const {cmd, get} = make(false, [dir])
      get.mockResolvedValue([{id: 3, settings: {}}])

      await cmd.run()

      expect(titlesOf(0)).toEqual(['Pull (untitled)'])
      expect(existsSync(join(dir, '3-untitled.json'))).toBe(true)
    })

    it('falls back to "untitled" for the slug when the form_title has no sluggable characters', async () => {
      const {cmd, get} = make(false, [dir])
      get.mockResolvedValue([{id: 4, settings: {form_title: '!!!'}}])

      await cmd.run()

      expect(existsSync(join(dir, '4-untitled.json'))).toBe(true)
    })

    it('creates the forms directory itself before writing when it does not exist yet', async () => {
      const formsDir = join(dir, 'forms')
      const {cmd, get} = make(false, [formsDir])
      get.mockResolvedValue([{id: 9, settings: {form_title: 'Contact'}}])

      await cmd.run()

      expect(readFileSync(join(formsDir, '9-contact.json'), 'utf8')).toContain('"id": 9')
    })

    it('pluralizes the final summary for more than one form', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([
        {id: 1, settings: {form_title: 'A'}},
        {id: 2, settings: {form_title: 'B'}},
      ])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('Pulled 2 forms to ' + dir)
    })

    it('does not create the forms directory when there is nothing to pull', async () => {
      const formsDir = join(dir, 'forms')
      const {cmd, get} = make(false, [formsDir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(existsSync(formsDir)).toBe(false)
    })

    it('skips forms with no id and warns with the exact count, without writing them', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([{id: 9, settings: {form_title: 'Contact'}}, {settings: {form_title: 'No id'}}])

      await cmd.run()

      expect(logs.warn).toHaveBeenCalledWith('1 form skipped because they have no id')
      expect(existsSync(join(dir, '9-contact.json'))).toBe(true)
    })

    it('pluralizes the skip warning for more than one skipped form', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([{settings: {form_title: 'A'}}, {settings: {form_title: 'B'}}])

      await cmd.run()

      expect(logs.warn).toHaveBeenCalledWith('2 forms skipped because they have no id')
    })

    it('does not warn when every form has an id', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([{id: 9, settings: {form_title: 'Contact'}}])

      await cmd.run()

      expect(logs.warn).not.toHaveBeenCalled()
    })

    it('wires removeOrphanedFiles with the path, the exact orphan list keyed by numeric prefix, and the reason', async () => {
      writeFileSync(join(dir, '5-gone.json'), '{}')
      writeFileSync(join(dir, '9-contact.json'), '{}')
      const {cmd, get, internals} = make(false, [dir])
      get.mockResolvedValue([{id: 9, settings: {form_title: 'Contact'}}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles').mockResolvedValue(undefined)

      await cmd.run()

      expect(removeOrphanedFiles).toHaveBeenCalledWith(dir, ['5-gone.json'], `in ${dir} no longer present on WordPress`)
    })

    it('does nothing on dry-run: no directory created, no items written, no removal, correct dry-run message', async () => {
      const emptyDir = join(dir, 'forms')
      const {cmd, get, internals, logs} = make(true, [emptyDir])
      get.mockResolvedValue([{id: 9, settings: {form_title: 'Contact'}}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles')

      await cmd.run()

      expect(existsSync(emptyDir)).toBe(false)
      expect(removeOrphanedFiles).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 1 form to ' + emptyDir)
    })

    it('pluralizes the dry-run "Would pull" message for more than one form', async () => {
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([
        {id: 1, settings: {form_title: 'A'}},
        {id: 2, settings: {form_title: 'B'}},
      ])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 2 forms to ' + dir)
    })

    it('reports would-remove with singular wording for exactly one orphan on dry-run, without deleting it', async () => {
      writeFileSync(join(dir, '5-gone.json'), '{}')
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(`[dry-run] Would remove 1 local file in ${dir} no longer present on WordPress: 5-gone.json`)
      expect(existsSync(join(dir, '5-gone.json'))).toBe(true)
    })

    it('reports would-remove with a comma-separated, pluralized list for more than one orphan on dry-run', async () => {
      writeFileSync(join(dir, '5-gone.json'), '{}')
      writeFileSync(join(dir, '6-also-gone.json'), '{}')
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(
        `[dry-run] Would remove 2 local files in ${dir} no longer present on WordPress: 5-gone.json, 6-also-gone.json`,
      )
    })

    it('does not log a would-remove line on dry-run when there are no orphans', async () => {
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Would remove'))
    })
  })
})
