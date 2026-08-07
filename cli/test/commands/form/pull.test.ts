import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {findOrphanedFiles as findOrphanedFilesLib, numericPrefixKey} from '../../../src/lib/find-orphaned-files.js'

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
})
