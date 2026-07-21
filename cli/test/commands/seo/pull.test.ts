import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull, {redirectFileBase} from '../../../src/commands/seo/pull.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type PullInternals = {
  findOrphanedFiles(dir: string, keepKeys: Set<string>, numericIdPrefix: boolean): Promise<string[]>
  pullRedirects(basePath: string): Promise<void>
  wpClient: {get: ReturnType<typeof vi.fn>}
}

function makeCmd(): {cmd: PullInternals; logs: ReturnType<typeof silenceLogs>} {
  const cmd = new Pull([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd: cmd as unknown as PullInternals, logs}
}

describe('seo pull helpers', () => {
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
      dir = mkdtempSync(join(tmpdir(), 'lps-seo-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds a slug-keyed file (post-meta) no longer present remotely', async () => {
      writeFileSync(join(dir, 'about.json'), '{}')

      const {cmd} = makeCmd()
      const orphans = await cmd.findOrphanedFiles(dir, new Set(), false)

      expect(orphans).toEqual(['about.json'])
    })

    it('keeps a slug-keyed file still present remotely', async () => {
      writeFileSync(join(dir, 'about.json'), '{}')

      const {cmd} = makeCmd()
      const orphans = await cmd.findOrphanedFiles(dir, new Set(['about']), false)

      expect(orphans).toEqual([])
    })

    it('finds an id-prefixed file (redirects) whose id is no longer present remotely', async () => {
      writeFileSync(join(dir, '5-old-page.json'), '{}')

      const {cmd} = makeCmd()
      const orphans = await cmd.findOrphanedFiles(dir, new Set(), true)

      expect(orphans).toEqual(['5-old-page.json'])
    })

    it('returns an empty list when the directory does not exist yet', async () => {
      const {cmd} = makeCmd()
      const orphans = await cmd.findOrphanedFiles(join(dir, 'does-not-exist'), new Set(), false)

      expect(orphans).toEqual([])
    })
  })

  describe('pullRedirects', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-seo-pull-redirects-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    // The active SEO plugin not supporting redirects (e.g. Yoast) must not abort the rest of
    // `seo pull` (settings/post-meta already succeeded), just skip this part with a warning.
    it('warns and skips instead of throwing when the active plugin does not support redirects', async () => {
      const {cmd, logs} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(new Error('Redirects are not supported by the active SEO plugin.'))
      cmd.wpClient = {get}

      await cmd.pullRedirects(dir)

      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Redirects are not supported'))
    })
  })
})
