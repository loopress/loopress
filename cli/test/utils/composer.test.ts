import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  getComposerManagedSlugs,
  NOT_ON_WORDPRESS_ORG,
  pullIntoComposerJson,
  readComposerJson,
  readComposerLock,
  requireToInstall,
  toIntent,
  wpackagistRequire,
} from '../../src/utils/composer.js'

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

      slugs.sort((a, b) => a.localeCompare(b))
      expect(slugs).toEqual(['akismet', 'query-monitor', 'wordpress-seo'])
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

  describe('readComposerLock', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-composer-lock-test-'))
      vi.spyOn(process, 'cwd').mockReturnValue(dir)
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('returns composer.lock verbatim from the current directory', async () => {
      writeFileSync(join(dir, 'composer.lock'), '{"packages": []}\n')

      expect(await readComposerLock()).toBe('{"packages": []}\n')
    })

    it('returns null when there is no composer.lock', async () => {
      expect(await readComposerLock()).toBeNull()
    })

    it('returns null when composer.lock cannot be read', async () => {
      mkdirSync(join(dir, 'composer.lock'))

      expect(await readComposerLock()).toBeNull()
    })
  })

  describe('toIntent', () => {
    it('splits plugins, themes and libraries, leaving composer/installers out', () => {
      expect(
        toIntent({
          'composer/installers': '^2.0',
          'monolog/monolog': '^3.0',
          'wpackagist-plugin/akismet': '5.3',
          'wpackagist-theme/astra': '^4.0',
        }),
      ).toEqual({libraries: {'monolog/monolog': '^3.0'}, plugins: {akismet: '5.3'}, themes: {astra: '^4.0'}})
    })
  })

  describe('requireToInstall / wpackagistRequire', () => {
    const composerJson = {
      require: {'wpackagist-plugin/akismet': '5.3', 'wpackagist-theme/astra': '4.0'},
      'require-dev': {'wpackagist-plugin/query-monitor': '3.16'},
    }

    it('installs require-dev only when asked', () => {
      expect(requireToInstall(composerJson, false)).toEqual(composerJson.require)
      expect(requireToInstall(composerJson, true)).toEqual({...composerJson.require, ...composerJson['require-dev']})
    })

    it('keys the wpackagist entries of one kind by slug, without require-dev by default', () => {
      expect(wpackagistRequire(composerJson, 'plugin')).toEqual({akismet: '5.3'})
      expect(wpackagistRequire(composerJson, 'plugin', true)).toEqual({akismet: '5.3', 'query-monitor': '3.16'})
      expect(wpackagistRequire(composerJson, 'theme')).toEqual({astra: '4.0'})
    })
  })

  describe('pullIntoComposerJson', () => {
    let dir: string
    let path: string
    let logs: string[]
    const log = (message: string) => {
      logs.push(message)
    }

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-composer-pull-test-'))
      path = join(dir, 'composer.json')
      logs = []
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    const stubWordPressOrg = (status: (slug: string) => number) =>
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const slug = new URL(url as string).searchParams.get('slug') ?? ''
        return new Response('{}', {status: status(slug)})
      })

    it('pins exact versions, keeps constraints, skips require-dev and provided slugs, and adds what WordPress.org serves', async () => {
      writeFileSync(
        path,
        JSON.stringify(
          {
            name: 'acme/site',
            require: {
              'acme/custom': '^1.0',
              'wpackagist-plugin/akismet': '5.2',
              'wpackagist-plugin/same': '1.0',
              'wpackagist-plugin/wordpress-seo': '^22.0',
            },
            'require-dev': {'wpackagist-plugin/query-monitor': '3.15'},
          },
          null,
          2,
        ) + '\n',
      )
      const fetchSpy = stubWordPressOrg((slug) => (slug === 'premium' ? 404 : 200))

      const result = await pullIntoComposerJson(
        path,
        'plugin',
        {akismet: '5.3', custom: '1.1', 'new-one': '2.0', premium: '1.0', 'query-monitor': '3.16', same: '1.0', 'wordpress-seo': '23.0'},
        {dryRun: false, log},
      )

      expect(result).toEqual({
        added: ['new-one'],
        merged: {akismet: '5.3', 'new-one': '2.0', same: '1.0'},
        skipped: [
          {reason: 'provided by acme/custom', slug: 'custom'},
          {reason: 'declared in require-dev', slug: 'query-monitor'},
          {reason: 'keeps constraint ^22.0, live 23.0', slug: 'wordpress-seo'},
          {reason: NOT_ON_WORDPRESS_ORG, slug: 'premium'},
        ],
        updated: [{from: '5.2', slug: 'akismet', to: '5.3'}],
      })
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&slug=new-one',
      )
      expect(readFileSync(path, 'utf8')).toBe(
        JSON.stringify(
          {
            name: 'acme/site',
            require: {
              'acme/custom': '^1.0',
              'wpackagist-plugin/akismet': '5.3',
              'wpackagist-plugin/same': '1.0',
              'wpackagist-plugin/wordpress-seo': '^22.0',
              'wpackagist-plugin/new-one': '2.0',
            },
            'require-dev': {'wpackagist-plugin/query-monitor': '3.15'},
          },
          null,
          2,
        ) + '\n',
      )
      expect(logs).toEqual([
        'Pinned 3 plugins in composer.json',
        '  + Added: new-one',
        '  ~ Updated: akismet 5.2 → 5.3',
        '  - Skipped: custom (provided by acme/custom)',
        '  - Skipped: query-monitor (declared in require-dev)',
        '  - Skipped: wordpress-seo (keeps constraint ^22.0, live 23.0)',
        `  - Skipped: premium (${NOT_ON_WORDPRESS_ORG})`,
        'Run `lps composer push` to apply.',
      ])
    })

    it('copies tab indentation and the missing trailing newline', async () => {
      writeFileSync(path, '{\n\t"require": {}\n}')
      stubWordPressOrg(() => 200)

      await pullIntoComposerJson(path, 'theme', {astra: '4.0'}, {dryRun: false, log})

      expect(readFileSync(path, 'utf8')).toBe('{\n\t"require": {\n\t\t"wpackagist-theme/astra": "4.0"\n\t}\n}')
    })

    it('writes 4 spaces when the file has no indentation to copy', async () => {
      writeFileSync(path, '{}\n')
      stubWordPressOrg(() => 200)

      await pullIntoComposerJson(path, 'plugin', {akismet: '5.3'}, {dryRun: false, log})

      expect(readFileSync(path, 'utf8')).toBe('{\n    "require": {\n        "wpackagist-plugin/akismet": "5.3"\n    }\n}\n')
    })

    it('keeps a two-space indentation', async () => {
      writeFileSync(path, '{\n  "require": {}\n}\n')
      stubWordPressOrg(() => 200)

      await pullIntoComposerJson(path, 'plugin', {akismet: '5.3'}, {dryRun: false, log})

      expect(readFileSync(path, 'utf8')).toBe('{\n  "require": {\n    "wpackagist-plugin/akismet": "5.3"\n  }\n}\n')
    })

    it('does not treat a package of the other kind with the same slug as its provider', async () => {
      writeFileSync(path, JSON.stringify({require: {'wpackagist-theme/astra': '4.0'}}))
      stubWordPressOrg(() => 200)

      const result = await pullIntoComposerJson(path, 'plugin', {astra: '1.0'}, {dryRun: false, log})

      expect(result.skipped).toEqual([])
      expect(result.added).toEqual(['astra'])
    })

    it('ignores a dependency name without a vendor', async () => {
      writeFileSync(path, JSON.stringify({require: {php: '>=8.1'}}))
      stubWordPressOrg(() => 200)

      const result = await pullIntoComposerJson(path, 'plugin', {php: '1.0'}, {dryRun: false, log})

      expect(result.added).toEqual(['php'])
    })

    it('keeps a constraint equal to the live version, and lists every added slug', async () => {
      writeFileSync(path, JSON.stringify({require: {'wpackagist-plugin/akismet': 'dev-trunk'}}))
      stubWordPressOrg(() => 200)

      const result = await pullIntoComposerJson(path, 'plugin', {akismet: 'dev-trunk', a: '1.0', b: '2.0'}, {dryRun: false, log})

      expect(result.merged).toEqual({a: '1.0', akismet: 'dev-trunk', b: '2.0'})
      expect(logs).toContain('  + Added: a, b')
    })

    it('only logs the pin count when nothing changed', async () => {
      writeFileSync(path, JSON.stringify({require: {'wpackagist-plugin/akismet': '5.3'}}))

      const result = await pullIntoComposerJson(path, 'plugin', {akismet: '5.3'}, {dryRun: false, log})

      expect(result).toEqual({added: [], merged: {akismet: '5.3'}, skipped: [], updated: []})
      expect(logs).toEqual(['Pinned 1 plugins in composer.json'])
    })

    it('suggests a push after an update alone', async () => {
      writeFileSync(path, JSON.stringify({require: {'wpackagist-plugin/akismet': '5.2'}}))

      await pullIntoComposerJson(path, 'plugin', {akismet: '5.3'}, {dryRun: false, log})

      expect(logs.at(-1)).toBe('Run `lps composer push` to apply.')
    })

    it('leaves the file untouched on a dry run', async () => {
      const original = JSON.stringify({require: {'wpackagist-plugin/akismet': '5.2'}})
      writeFileSync(path, original)
      stubWordPressOrg(() => 200)

      await pullIntoComposerJson(path, 'plugin', {akismet: '5.3', 'new-one': '1.0'}, {dryRun: true, log})

      expect(readFileSync(path, 'utf8')).toBe(original)
      expect(logs).toEqual(['[dry-run] Would pin 2 plugins in composer.json', '  + Added: new-one', '  ~ Updated: akismet 5.2 → 5.3'])
    })

    it('refuses to write when WordPress.org answers an error', async () => {
      const original = '{}'
      writeFileSync(path, original)
      stubWordPressOrg(() => 500)

      await expect(pullIntoComposerJson(path, 'theme', {astra: '4.0'}, {dryRun: false, log})).rejects.toThrow(
        'Could not check whether the theme "astra" is on WordPress.org (HTTP 500), so composer.json was not modified. ' +
          'Loopress only adds packages WPackagist can serve. Retry once api.wordpress.org is reachable.',
      )
      expect(readFileSync(path, 'utf8')).toBe(original)
    })

    it('refuses to write when WordPress.org is unreachable', async () => {
      writeFileSync(path, '{}')
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'))

      await expect(pullIntoComposerJson(path, 'plugin', {akismet: '5.3'}, {dryRun: false, log})).rejects.toThrow(
        '(network error: ENOTFOUND)',
      )
    })
  })
})
