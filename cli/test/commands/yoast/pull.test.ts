import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import Pull from '../../../src/commands/yoast/pull.js'
import {fakeOclifConfig} from '../../helpers/oclif.js'

type PullWithFindOrphanedFiles = {findOrphanedFiles(dir: string, keepSlugs: Set<string>): Promise<string[]>}

function findOrphanedFiles(dir: string, keepSlugs: Set<string>): Promise<string[]> {
  const cmd = new Pull([], fakeOclifConfig) as unknown as PullWithFindOrphanedFiles
  return cmd.findOrphanedFiles(dir, keepSlugs)
}

describe('yoast pull helpers', () => {
  describe('findOrphanedFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-yoast-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds a slug-keyed file no longer present remotely', async () => {
      writeFileSync(join(dir, 'about.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual(['about.json'])
    })

    it('keeps a slug-keyed file still present remotely', async () => {
      writeFileSync(join(dir, 'about.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set(['about']))

      expect(orphans).toEqual([])
    })

    it('ignores non-.json files', async () => {
      writeFileSync(join(dir, 'README.md'), '# notes')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('returns an empty list when the directory does not exist yet', async () => {
      const orphans = await findOrphanedFiles(join(dir, 'does-not-exist'), new Set())

      expect(orphans).toEqual([])
    })
  })
})
