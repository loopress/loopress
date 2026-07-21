import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import Pull, {redirectFileBase} from '../../../src/commands/rankmath/pull.js'
import {fakeOclifConfig} from '../../helpers/oclif.js'

type PullWithFindOrphanedFiles = {
  findOrphanedFiles(dir: string, keepKeys: Set<string>, numericIdPrefix: boolean): Promise<string[]>
}

function findOrphanedFiles(dir: string, keepKeys: Set<string>, numericIdPrefix: boolean): Promise<string[]> {
  const cmd = new Pull([], fakeOclifConfig) as unknown as PullWithFindOrphanedFiles
  return cmd.findOrphanedFiles(dir, keepKeys, numericIdPrefix)
}

describe('rankmath pull helpers', () => {
  describe('redirectFileBase', () => {
    it('slugifies the destination URL', () => {
      expect(redirectFileBase({headerCode: 301, id: 3, sources: [], status: 'active', urlTo: '/New Page!', createdAt: null, updatedAt: null})).toBe(
        '3-new-page',
      )
    })

    it('falls back to "redirect" when the destination has no sluggable characters', () => {
      expect(redirectFileBase({headerCode: 301, id: 9, sources: [], status: 'active', urlTo: '///', createdAt: null, updatedAt: null})).toBe(
        '9-redirect',
      )
    })
  })

  describe('findOrphanedFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-rankmath-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds a slug-keyed file (post-meta) no longer present remotely', async () => {
      writeFileSync(join(dir, 'about.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set(), false)

      expect(orphans).toEqual(['about.json'])
    })

    it('keeps a slug-keyed file still present remotely', async () => {
      writeFileSync(join(dir, 'about.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set(['about']), false)

      expect(orphans).toEqual([])
    })

    it('finds an id-prefixed file (redirects) whose id is no longer present remotely', async () => {
      writeFileSync(join(dir, '5-old-page.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set(), true)

      expect(orphans).toEqual(['5-old-page.json'])
    })

    it('keeps an id-prefixed file whose id is still present remotely', async () => {
      writeFileSync(join(dir, '5-old-page.json'), '{}')

      const orphans = await findOrphanedFiles(dir, new Set(['5']), true)

      expect(orphans).toEqual([])
    })

    it('ignores non-.json files', async () => {
      writeFileSync(join(dir, 'README.md'), '# notes')

      const orphans = await findOrphanedFiles(dir, new Set(), false)

      expect(orphans).toEqual([])
    })

    it('returns an empty list when the directory does not exist yet', async () => {
      const orphans = await findOrphanedFiles(join(dir, 'does-not-exist'), new Set(), false)

      expect(orphans).toEqual([])
    })
  })
})
