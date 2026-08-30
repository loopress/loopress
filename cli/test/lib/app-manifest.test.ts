import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {
  buildFileList,
  computeBuildId,
  deriveEntry,
  diffFiles,
  loadAppManifest,
  parseAppConfig,
} from '../../src/lib/app-manifest.js'

describe('app-manifest', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-app-manifest-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('buildFileList', () => {
    it('hashes every file, sorted, with forward-slash paths', async () => {
      mkdirSync(join(dir, 'assets'), {recursive: true})
      writeFileSync(join(dir, 'index.html'), '<!doctype html>')
      writeFileSync(join(dir, 'assets', 'a.js'), 'console.log(1)')

      const files = await buildFileList(dir)

      expect(files.map((f) => f.path)).toEqual(['assets/a.js', 'index.html'])
      expect(files[0].sha256).toHaveLength(64)
      expect(files[1].size).toBe('<!doctype html>'.length)
    })

    it('rejects a file whose extension the server would not serve', async () => {
      writeFileSync(join(dir, 'shell.php'), '<?php')

      await expect(buildFileList(dir)).rejects.toThrow('not an allowed static asset')
    })

    it('returns an empty list for a missing directory', async () => {
      expect(await buildFileList(join(dir, 'nope'))).toEqual([])
    })
  })

  describe('computeBuildId', () => {
    it('is stable for the same content and order-independent', () => {
      const a = [
        {path: 'a.js', sha256: 'x'.repeat(64), size: 1},
        {path: 'b.js', sha256: 'y'.repeat(64), size: 2},
      ]
      const reordered = [a[1], a[0]]

      expect(computeBuildId(a)).toBe(computeBuildId(reordered))
      expect(computeBuildId(a)).toHaveLength(12)
    })

    it('changes when a file hash changes', () => {
      const before = [{path: 'a.js', sha256: 'x'.repeat(64), size: 1}]
      const after = [{path: 'a.js', sha256: 'z'.repeat(64), size: 1}]

      expect(computeBuildId(before)).not.toBe(computeBuildId(after))
    })
  })

  describe('deriveEntry', () => {
    it('reads module scripts and stylesheet links, normalising the URL', () => {
      const html = [
        '<!doctype html><html><head>',
        '<link rel="stylesheet" href="/assets/index-abc.css">',
        '<link rel="modulepreload" href="/assets/vendor-x.js">',
        '</head><body>',
        '<script type="module" crossorigin src="/assets/index-def.js"></script>',
        '<script src="/legacy.js"></script>',
        '</body></html>',
      ].join('')

      expect(deriveEntry(html)).toEqual({
        scripts: ['assets/index-def.js'],
        styles: ['assets/index-abc.css'],
      })
    })

    it('strips an absolute origin and a ./ prefix', () => {
      const html =
        '<script type="module" src="https://cdn.example.com/assets/a.js"></script>' +
        '<link rel="stylesheet" href="./assets/b.css">'

      expect(deriveEntry(html)).toEqual({scripts: ['assets/a.js'], styles: ['assets/b.css']})
    })
  })

  describe('diffFiles', () => {
    it('returns new and changed files, ignoring unchanged ones', () => {
      const local = [
        {path: 'a.js', sha256: 'aaa', size: 1},
        {path: 'b.js', sha256: 'NEW', size: 1},
        {path: 'c.js', sha256: 'ccc', size: 1},
      ]
      const remote = [
        {path: 'a.js', sha256: 'aaa', size: 1},
        {path: 'b.js', sha256: 'old', size: 1},
      ]

      expect(diffFiles(local, remote).map((f) => f.path)).toEqual(['b.js', 'c.js'])
    })
  })

  describe('parseAppConfig', () => {
    it('rejects invalid JSON', () => {
      expect(() => parseAppConfig('{not json', dir)).toThrow('not valid JSON')
    })

    it('rejects an unsupported routing mode', () => {
      expect(() => parseAppConfig(JSON.stringify({routing: 'history'}), dir)).toThrow('not supported')
    })
  })

  describe('loadAppManifest', () => {
    function scaffold(config: Record<string, unknown>, indexHtml: string): void {
      writeFileSync(join(dir, 'loopress.app.json'), JSON.stringify(config))
      mkdirSync(join(dir, 'dist', 'assets'), {recursive: true})
      writeFileSync(join(dir, 'dist', 'index.html'), indexHtml)
      writeFileSync(join(dir, 'dist', 'assets', 'index-abc.js'), 'app')
      writeFileSync(join(dir, 'dist', 'assets', 'index-abc.css'), 'body{}')
    }

    it('assembles a manifest with derived entry, build id and default mount selector', async () => {
      scaffold(
        {},
        '<link rel="stylesheet" href="/assets/index-abc.css">' +
          '<script type="module" src="/assets/index-abc.js"></script>',
      )

      const {manifest} = await loadAppManifest(dir, 'search')

      expect(manifest.name).toBe('search')
      expect(manifest.mountSelector).toBe('#loopress-app-search')
      expect(manifest.routing).toBe('hash')
      expect(manifest.entry).toEqual({scripts: ['assets/index-abc.js'], styles: ['assets/index-abc.css']})
      expect(manifest.buildId).toHaveLength(12)
      expect(manifest.files.map((f) => f.path).sort()).toEqual([
        'assets/index-abc.css',
        'assets/index-abc.js',
        'index.html',
      ])
    })

    it('fails when the entry references a file not in the build output', async () => {
      scaffold({}, '<script type="module" src="/assets/missing.js"></script>')

      await expect(loadAppManifest(dir, 'search')).rejects.toThrow('not in the build output')
    })

    it('rejects an invalid app name from the config', async () => {
      scaffold({name: 'Bad_Name'}, '<script type="module" src="/assets/index-abc.js"></script>')

      await expect(loadAppManifest(dir, 'search')).rejects.toThrow('Invalid app name')
    })
  })
})
