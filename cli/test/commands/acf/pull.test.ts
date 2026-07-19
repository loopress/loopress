import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import Pull from '../../../src/commands/acf/pull.js'
import {fakeOclifConfig} from '../../helpers/oclif.js'

type PullWithFindOrphanedFiles = {findOrphanedFiles(dir: string, keepKeys: Set<string>): Promise<string[]>}

function findOrphanedFiles(dir: string, keepKeys: Set<string>): Promise<string[]> {
  const cmd = new Pull([], fakeOclifConfig) as unknown as PullWithFindOrphanedFiles
  return cmd.findOrphanedFiles(dir, keepKeys)
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
})
