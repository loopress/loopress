import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import Pull from '../../../src/commands/api/pull.js'
import {fakeOclifConfig} from '../../helpers/oclif.js'

type PullWithFindOrphanedFiles = {findOrphanedFiles(path: string, keepFilenames: Set<string>): Promise<string[]>}

function findOrphanedFiles(path: string, keepFilenames: Set<string>): Promise<string[]> {
  const cmd = new Pull([], fakeOclifConfig) as unknown as PullWithFindOrphanedFiles
  return cmd.findOrphanedFiles(path, keepFilenames)
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
  })
})
