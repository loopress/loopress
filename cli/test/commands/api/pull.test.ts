import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {basenameKey, findOrphanedFiles as findOrphanedFilesLib} from '../../../src/lib/find-orphaned-files.js'

// The same matcher `api pull` wires in run(): `<filename>.php`, the whole basename is the key,
// recursive since a path-param route file can live in a subdirectory.
function findOrphanedFiles(path: string, keepFilenames: Set<string>): Promise<string[]> {
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
})
