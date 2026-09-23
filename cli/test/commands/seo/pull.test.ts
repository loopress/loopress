import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/seo/pull.js'
import {
  basenameKey,
  findOrphanedFiles as findOrphanedFilesLib,
  numericPrefixKey,
} from '../../../src/lib/find-orphaned-files.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {redirectFileBase} from '../../../src/utils/seo-format.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type PullInternals = {
  dryRun: boolean
  pullPostMeta(postType: string, basePath: string): Promise<void>
  pullRedirects(basePath: string): Promise<void>
  pullSettings(basePath: string): Promise<void>
  wpClient: {get: ReturnType<typeof vi.fn>}
}

// The same matchers `seo pull` wires: post-meta uses the whole `<slug>` basename as key,
// redirects use the `<id>-` numeric prefix.
async function findOrphanedFiles(dir: string, keepKeys: Set<string>, numericIdPrefix: boolean): Promise<string[]> {
  return findOrphanedFilesLib(dir, keepKeys, {
    extensions: ['.json'],
    key: numericIdPrefix ? numericPrefixKey : basenameKey,
  })
}

function makeCmd(): {cmd: PullInternals; logs: ReturnType<typeof silenceLogs>} {
  const cmd = new Pull([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd: cmd as unknown as PullInternals, logs}
}

describe('seo pull helpers', () => {
  describe('redirectFileBase', () => {
    it('slugifies the destination URL', () => {
      expect(
        redirectFileBase({
          headerCode: 301,
          id: 3,
          sources: [],
          status: 'active',
          urlTo: '/New Page!',
          createdAt: null,
          updatedAt: null,
        }),
      ).toBe('3-new-page')
    })

    it('falls back to "redirect" when the destination has no sluggable characters', () => {
      expect(
        redirectFileBase({
          headerCode: 301,
          id: 9,
          sources: [],
          status: 'active',
          urlTo: '///',
          createdAt: null,
          updatedAt: null,
        }),
      ).toBe('9-redirect')
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

    it('returns an empty list when the directory does not exist yet', async () => {
      const orphans = await findOrphanedFiles(join(dir, 'does-not-exist'), new Set(), false)

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

    it('writes each redirect to disk under its <id>-<slug> filename', async () => {
      const {cmd} = makeCmd()
      const redirect = {
        createdAt: null,
        headerCode: 301,
        hits: 0,
        id: 4,
        sources: [],
        status: 'active',
        updatedAt: null,
        urlTo: '/new-page',
      }
      cmd.wpClient = {get: vi.fn().mockResolvedValueOnce([redirect])}

      await cmd.pullRedirects(dir)

      const written = JSON.parse(readFileSync(join(dir, 'redirects', '4-new-page.json'), 'utf8'))
      expect(written).toEqual(redirect)
    })

    it('removes a local redirect file no longer present remotely', async () => {
      const {cmd} = makeCmd()
      cmd.wpClient = {get: vi.fn().mockResolvedValueOnce([])}
      mkdirSync(join(dir, 'redirects'), {recursive: true})
      writeFileSync(join(dir, 'redirects', '9-gone.json'), '{}')

      await cmd.pullRedirects(dir)

      expect(existsSync(join(dir, 'redirects', '9-gone.json'))).toBe(false)
    })
  })

  describe('pullSettings', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-seo-pull-settings-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('writes the fetched settings to settings.json, dropping the revision (#234)', async () => {
      const {cmd, logs} = makeCmd()
      cmd.wpClient = {get: vi.fn().mockResolvedValueOnce({revision: 'rev-1', settings: {titleSeparator: '-'}})}

      await cmd.pullSettings(dir)

      const written = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
      expect(written).toEqual({titleSeparator: '-'})
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Pulled settings to'))
    })

    it('does not write anything on a dry run', async () => {
      const {cmd, logs} = makeCmd()
      cmd.dryRun = true
      cmd.wpClient = {get: vi.fn().mockResolvedValueOnce({revision: 'rev-1', settings: {titleSeparator: '-'}})}

      await cmd.pullSettings(dir)

      expect(existsSync(join(dir, 'settings.json'))).toBe(false)
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })
  })

  describe('pullPostMeta', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-seo-pull-postmeta-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('writes each remote post-meta entry to <slug>.json under post-meta/<type>/, dropping the revision (#234)', async () => {
      const {cmd} = makeCmd()
      const post = {meta: {seo_title: 'About'}, revision: 'rev-1', slug: 'about', title: 'About'}
      cmd.wpClient = {get: vi.fn().mockResolvedValueOnce([post])}

      await cmd.pullPostMeta('page', dir)

      const written = JSON.parse(readFileSync(join(dir, 'post-meta', 'page', 'about.json'), 'utf8'))
      expect(written).toEqual({meta: {seo_title: 'About'}, slug: 'about', title: 'About'})
    })

    it('removes a local post-meta file whose slug is no longer present remotely', async () => {
      const {cmd} = makeCmd()
      cmd.wpClient = {get: vi.fn().mockResolvedValueOnce([])}
      mkdirSync(join(dir, 'post-meta', 'page'), {recursive: true})
      writeFileSync(join(dir, 'post-meta', 'page', 'gone.json'), '{}')

      await cmd.pullPostMeta('page', dir)

      expect(existsSync(join(dir, 'post-meta', 'page', 'gone.json'))).toBe(false)
    })
  })

  describe('run', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-seo-pull-run-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    function makeRunCmd(argv: string[] = []) {
      const cmd = new Pull(argv, fakeOclifConfig)
      const internals = cmd as unknown as {localConfig: LoopressLocalConfig; siteConfig: EnvironmentConfig}
      internals.localConfig = {rootDir: dir}
      internals.siteConfig = makeEnv('production', 'https://acme.com')
      const logs = silenceLogs(cmd)
      const get = vi.fn().mockImplementation(async (path: string) => {
        if (path === 'loopress/v1/seo/settings') return {revision: 'rev-1', settings: {}}
        return []
      })
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}
      return {cmd, get, logs}
    }

    it('pulls settings, every default post type, and redirects, in that order', async () => {
      const {cmd, get} = makeRunCmd()

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/seo/settings')
      expect(get).toHaveBeenCalledWith('loopress/v1/seo/post-meta/post')
      expect(get).toHaveBeenCalledWith('loopress/v1/seo/post-meta/page')
      expect(get).toHaveBeenCalledWith('loopress/v1/seo/redirects')
    })

    it('limits post-meta to the given --post-type flags, not every default type', async () => {
      const {cmd, get} = makeRunCmd(['--post-type', 'post'])

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/seo/post-meta/post')
      expect(get).not.toHaveBeenCalledWith('loopress/v1/seo/post-meta/page')
    })
  })
})
