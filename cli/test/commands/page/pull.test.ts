import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/page/pull.js'
import {findOrphanedFiles as findOrphanedFilesLib, numericPrefixKey} from '../../../src/lib/find-orphaned-files.js'
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

// The same matcher `page pull` wires in run(): both the `<id>-<slug>.html` and
// `<id>-<slug>.json` of a pair are candidates, the numeric prefix is the id.
async function findOrphanedFiles(dir: string, keepIds: Set<string>): Promise<string[]> {
  return findOrphanedFilesLib(dir, keepIds, {extensions: ['.json', '.html'], key: numericPrefixKey})
}

describe('page pull', () => {
  describe('findOrphanedFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-page-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds both files of a pair whose id is no longer present remotely', async () => {
      writeFileSync(join(dir, '9-contact.html'), '<p>Hi</p>')
      writeFileSync(join(dir, '9-contact.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set())

      orphans.sort((a, b) => a.localeCompare(b))
      expect(orphans).toEqual(['9-contact.html', '9-contact.json'])
    })

    it('keeps a pair whose id is still in the current remote list', async () => {
      writeFileSync(join(dir, '9-contact.html'), '<p>Hi</p>')
      writeFileSync(join(dir, '9-contact.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set(['9']))

      expect(orphans).toEqual([])
    })

    it('ignores unrelated non .html/.json files', async () => {
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
      dir = mkdtempSync(join(tmpdir(), 'lps-page-pull-run-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('fetches wp/v2/pages with per_page and context=edit, and logs the banner lines', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(get).toHaveBeenCalledWith('wp/v2/pages?per_page=100&context=edit')
      expect(logs.log).toHaveBeenCalledWith('Pulling pages from https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`Pages path: ${dir}`)
    })

    it('writes a page to <id>-<slug>.html and <id>-<slug>.json, and reports the Listr title/output', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([{id: 9, content: '<p>Hi</p>', title: 'Contact Us', status: 'publish'}])

      const result = await cmd.run()

      expect(readFileSync(join(dir, '9-contact-us.html'), 'utf8')).toBe('<p>Hi</p>')
      const rawMeta = readFileSync(join(dir, '9-contact-us.json'), 'utf8')
      expect(JSON.parse(rawMeta)).toEqual({id: 9, title: 'Contact Us', status: 'publish'})
      expect(rawMeta.endsWith('\n')).toBe(true)
      expect(titlesOf(0)).toEqual(['Pull Contact Us'])
      expect(outputsOf(0)).toEqual(['Pulled: Contact Us'])
      expect(logs.log).toHaveBeenCalledWith('Pulled 1 page to ' + dir)
      expect(result).toEqual({orphans: [], pulled: [{id: 9, title: 'Contact Us'}], skipped: 0, status: 'success'})
    })

    it('reads content/title from the {raw, rendered} shape the ?context=edit API returns', async () => {
      const {cmd, get} = make(false, [dir])
      get.mockResolvedValue([{id: 5, content: {raw: '<p>Raw</p>', rendered: '<p>Rendered</p>'}, title: {raw: 'Raw Title', rendered: 'Rendered Title'}}])

      await cmd.run()

      expect(readFileSync(join(dir, '5-raw-title.html'), 'utf8')).toBe('<p>Raw</p>')
    })

    it('pluralizes the final summary and skip warning for more than one page', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([
        {id: 1, content: '<p>A</p>', title: 'A'},
        {id: 2, content: '<p>B</p>', title: 'B'},
        {content: '<p>No id 1</p>', title: 'No id 1'},
        {content: '<p>No id 2</p>', title: 'No id 2'},
      ])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('Pulled 2 pages to ' + dir)
      expect(logs.warn).toHaveBeenCalledWith('2 pages skipped because they have no id')
    })

    it('skips a page with no id and warns with the exact singular count', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([{id: 9, content: '<p>Hi</p>', title: 'Contact'}, {content: '<p>No id</p>', title: 'No id'}])

      await cmd.run()

      expect(logs.warn).toHaveBeenCalledWith('1 page skipped because they have no id')
      expect(existsSync(join(dir, '9-contact.html'))).toBe(true)
    })

    it('does not warn when every page has an id', async () => {
      const {cmd, get, logs} = make(false, [dir])
      get.mockResolvedValue([{id: 9, content: '<p>Hi</p>', title: 'Contact'}])

      await cmd.run()

      expect(logs.warn).not.toHaveBeenCalled()
    })

    it('creates the pages directory itself before writing when it does not exist yet', async () => {
      const pagesDir = join(dir, 'pages')
      const {cmd, get} = make(false, [pagesDir])
      get.mockResolvedValue([{id: 9, content: '<p>Hi</p>', title: 'Contact'}])

      await cmd.run()

      expect(existsSync(join(pagesDir, '9-contact.html'))).toBe(true)
    })

    it('does not create the pages directory when there is nothing to pull', async () => {
      const pagesDir = join(dir, 'pages')
      const {cmd, get} = make(false, [pagesDir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(existsSync(pagesDir)).toBe(false)
    })

    it('wires removeOrphanedFiles with the path, the exact orphan list (both html and json), and the reason', async () => {
      writeFileSync(join(dir, '5-gone.html'), '<p>Gone</p>')
      writeFileSync(join(dir, '5-gone.json'), '{}')
      writeFileSync(join(dir, '9-contact.html'), '<p>Hi</p>')
      writeFileSync(join(dir, '9-contact.json'), '{}')
      const {cmd, get, internals} = make(false, [dir])
      get.mockResolvedValue([{id: 9, content: '<p>Hi</p>', title: 'Contact'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles').mockResolvedValue(undefined)

      await cmd.run()

      const [[calledDir, orphans, reason]]: [[string, string[], string]] = removeOrphanedFiles.mock.calls
      expect(calledDir).toBe(dir)
      const sortedOrphans = [...orphans]
      sortedOrphans.sort((a, b) => a.localeCompare(b))
      expect(sortedOrphans).toEqual(['5-gone.html', '5-gone.json'])
      expect(reason).toBe(`in ${dir} no longer present on WordPress`)
    })

    it('does nothing on dry-run: no directory created, no items written, no removal, correct dry-run message and result', async () => {
      const pagesDir = join(dir, 'pages')
      const {cmd, get, internals, logs} = make(true, [pagesDir])
      get.mockResolvedValue([{id: 9, content: '<p>Hi</p>', title: 'Contact'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles')

      const result = await cmd.run()

      expect(existsSync(pagesDir)).toBe(false)
      expect(removeOrphanedFiles).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 1 page to ' + pagesDir)
      expect(result).toEqual({orphans: [], pulled: [{id: 9, title: 'Contact'}], skipped: 0, status: 'dry-run'})
    })

    it('pluralizes the dry-run "Would pull" message for more than one page', async () => {
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([
        {id: 1, content: '<p>A</p>', title: 'A'},
        {id: 2, content: '<p>B</p>', title: 'B'},
      ])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 2 pages to ' + dir)
    })

    it('reports would-remove with singular wording for exactly one orphan on dry-run, without deleting it', async () => {
      writeFileSync(join(dir, '5-gone.html'), '<p>Gone</p>')
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(`[dry-run] Would remove 1 local file in ${dir} no longer present on WordPress: 5-gone.html`)
      expect(existsSync(join(dir, '5-gone.html'))).toBe(true)
    })

    it('reports would-remove with a comma-separated, pluralized list for more than one orphan on dry-run', async () => {
      writeFileSync(join(dir, '5-gone.html'), '<p>Gone</p>')
      writeFileSync(join(dir, '5-gone.json'), '{}')
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(
        `[dry-run] Would remove 2 local files in ${dir} no longer present on WordPress: 5-gone.html, 5-gone.json`,
      )
    })

    it('does not log a would-remove line on dry-run when there are no orphans', async () => {
      const {cmd, get, logs} = make(true, [dir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Would remove'))
    })

    it('uses the silent Listr renderer when --json is passed, the default renderer otherwise', async () => {
      const {cmd: jsonCmd, get: jsonGet} = make(false, [dir, '--json'])
      jsonGet.mockResolvedValue([{id: 9, content: '<p>Hi</p>', title: 'Contact'}])
      await jsonCmd.run()

      expect(listrInstances.at(-1)?.options).toEqual({renderer: 'silent'})

      const {cmd: plainCmd, get: plainGet} = make(false, [dir])
      plainGet.mockResolvedValue([{id: 9, content: '<p>Hi</p>', title: 'Contact'}])
      await plainCmd.run()

      expect(listrInstances.at(-1)?.options).toEqual({renderer: 'default'})
    })
  })
})
