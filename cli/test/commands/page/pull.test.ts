import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {findOrphanedFiles as findOrphanedFilesLib, numericPrefixKey} from '../../../src/lib/find-orphaned-files.js'

// The same matcher `page pull` wires in run(): both the `<id>-<slug>.html` and
// `<id>-<slug>.json` of a pair are candidates, the numeric prefix is the id.
function findOrphanedFiles(dir: string, keepIds: Set<string>): Promise<string[]> {
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

      expect(orphans.sort()).toEqual(['9-contact.html', '9-contact.json'])
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
})
