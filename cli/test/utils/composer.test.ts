import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getComposerManagedSlugs, readComposerJson} from '../../src/utils/composer.js'

describe('composer utils', () => {
  describe('getComposerManagedSlugs', () => {
    it('extracts wpackagist-plugin slugs from require and require-dev', () => {
      const slugs = getComposerManagedSlugs({
        require: {
          php: '>=8.1',
          'wpackagist-plugin/akismet': '^5.3',
          'wpackagist-plugin/wordpress-seo': '^22.0',
        },
        'require-dev': {
          'wpackagist-plugin/query-monitor': '^3.16',
        },
      })

      expect(slugs.sort()).toEqual(['akismet', 'query-monitor', 'wordpress-seo'])
    })

    it('returns an empty list when nothing is wpackagist-managed', () => {
      expect(getComposerManagedSlugs({require: {php: '>=8.1'}})).toEqual([])
      expect(getComposerManagedSlugs({})).toEqual([])
    })
  })

  describe('readComposerJson', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-composer-test-'))
      vi.spyOn(process, 'cwd').mockReturnValue(dir)
    })

    afterEach(() => {
      vi.restoreAllMocks()
      rmSync(dir, {force: true, recursive: true})
    })

    it('reads composer.json from the current directory', async () => {
      writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/akismet': '^5.3'}}))

      const result = await readComposerJson()

      expect(result).toEqual({require: {'wpackagist-plugin/akismet': '^5.3'}})
    })

    it('returns null when there is no composer.json', async () => {
      expect(await readComposerJson()).toBeNull()
    })

    it('returns null when composer.json is invalid JSON', async () => {
      writeFileSync(join(dir, 'composer.json'), '{not json')

      expect(await readComposerJson()).toBeNull()
    })
  })
})
