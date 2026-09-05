import {describe, expect, it} from 'vitest'

import {type InstalledPlugin, type WpNativePlugin} from '../../src/types/plugin.js'
import {
  diffPlugins,
  lockedWpackagistSlugs,
  mergePluginManifest,
  parseInstalledPlugins,
} from '../../src/utils/plugins.js'

const makePlugin = (slug: string, version: string, active = true): InstalledPlugin => ({
  active,
  file: `${slug}/${slug}`,
  name: slug,
  slug,
  version,
})

const makeNative = (plugin: string, overrides: Partial<WpNativePlugin> = {}): WpNativePlugin => ({
  name: plugin,
  plugin,
  plugin_uri: '',
  status: 'active',
  version: '1.0.0',
  ...overrides,
})

describe('plugins', () => {
  describe('mergePluginManifest', () => {
    it('adds all plugins when existing manifest is empty', () => {
      const {added, merged, updated} = mergePluginManifest({}, {woocommerce: 'latest', acf: 'latest'})
      expect(merged).toEqual({woocommerce: 'latest', acf: 'latest'})
      expect([...added].sort((a, b) => a.localeCompare(b))).toEqual(['acf', 'woocommerce'])
      expect(updated).toHaveLength(0)
    })

    it('keeps existing plugins that are not in incoming', () => {
      const {merged} = mergePluginManifest({wpcode: 'latest'}, {woocommerce: 'latest'})
      expect(merged).toHaveProperty('wpcode', 'latest')
      expect(merged).toHaveProperty('woocommerce', 'latest')
    })

    it('reports a plugin as updated when a stale pinned version migrates to "latest"', () => {
      const {merged, updated, added} = mergePluginManifest({woocommerce: '8.9.1'}, {woocommerce: 'latest'})
      expect(merged).toEqual({woocommerce: 'latest'})
      expect(updated).toEqual([{from: '8.9.1', slug: 'woocommerce', to: 'latest'}])
      expect(added).toHaveLength(0)
    })

    it('does not report a plugin as updated when the value is unchanged', () => {
      const {updated, added} = mergePluginManifest({woocommerce: 'latest'}, {woocommerce: 'latest'})
      expect(updated).toHaveLength(0)
      expect(added).toHaveLength(0)
    })

    it('handles an empty incoming manifest without touching existing entries', () => {
      const {merged, added, updated} = mergePluginManifest({woocommerce: 'latest'}, {})
      expect(merged).toEqual({woocommerce: 'latest'})
      expect(added).toHaveLength(0)
      expect(updated).toHaveLength(0)
    })

    it('reports added and updated separately in the same call', () => {
      const {added, updated} = mergePluginManifest({woocommerce: '8.9.1'}, {woocommerce: 'latest', acf: 'latest'})
      expect(added).toEqual(['acf'])
      expect(updated).toEqual([{from: '8.9.1', slug: 'woocommerce', to: 'latest'}])
    })
  })

  describe('parseInstalledPlugins', () => {
    it('derives the slug from the folder segment of the native plugin id', () => {
      const [plugin] = parseInstalledPlugins([makeNative('woocommerce/woocommerce')])
      expect(plugin.slug).toBe('woocommerce')
      expect(plugin.file).toBe('woocommerce/woocommerce')
    })

    it('derives the slug from a single-file plugin id with no folder', () => {
      const [plugin] = parseInstalledPlugins([makeNative('hello')])
      expect(plugin.slug).toBe('hello')
    })

    it('prefers the WordPress.org slug from plugin_uri when a single-file id disagrees with it', () => {
      const [plugin] = parseInstalledPlugins([
        makeNative('hello', {plugin_uri: 'https://wordpress.org/plugins/hello-dolly/'}),
      ])
      expect(plugin.slug).toBe('hello-dolly')
    })

    it('treats "inactive" status as not active and everything else as active', () => {
      const [active, inactive, networkActive] = parseInstalledPlugins([
        makeNative('woocommerce/woocommerce', {status: 'active'}),
        makeNative('acf/acf', {status: 'inactive'}),
        makeNative('multisite/multisite', {status: 'network-active'}),
      ])
      expect(active.active).toBe(true)
      expect(inactive.active).toBe(false)
      expect(networkActive.active).toBe(true)
    })

    it('filters out the Loopress plugin itself, under any slug it has ever shipped under', () => {
      const result = parseInstalledPlugins([
        makeNative('loopress/loopress'),
        makeNative('loopress-full/loopress'),
        makeNative('loopress-light/loopress'),
        makeNative('woocommerce/woocommerce'),
      ])
      expect(result.map((p) => p.slug)).toEqual(['woocommerce'])
    })
  })

  describe('diffPlugins', () => {
    const managed = (...slugs: string[]) => new Set(slugs)

    it('puts a manifest plugin missing from the site into toInstall with its wanted version', () => {
      const {toInstall} = diffPlugins({woocommerce: '9.4.2'}, [])
      expect(toInstall).toEqual([{slug: 'woocommerce', version: '9.4.2'}])
    })

    it('puts a managed active plugin at the pinned version into inSync', () => {
      const {inSync, toPin} = diffPlugins({woocommerce: '9.4.2'}, [makePlugin('woocommerce', '9.4.2')], managed('woocommerce'))
      expect(inSync).toEqual(['woocommerce'])
      expect(toPin).toHaveLength(0)
    })

    it('puts a managed plugin at the wrong version into toPin', () => {
      const {toPin} = diffPlugins({woocommerce: '9.4.2'}, [makePlugin('woocommerce', '9.5.0')], managed('woocommerce'))
      expect(toPin).toEqual([{from: '9.5.0', slug: 'woocommerce', to: '9.4.2'}])
    })

    it('never reports a version mismatch for a "latest" pin', () => {
      const {toPin, inSync} = diffPlugins({woocommerce: 'latest'}, [makePlugin('woocommerce', '9.5.0')], managed('woocommerce'))
      expect(toPin).toHaveLength(0)
      expect(inSync).toEqual(['woocommerce'])
    })

    it('puts a managed inactive plugin into toActivate with its native file id', () => {
      const {toActivate} = diffPlugins(
        {woocommerce: '9.4.2'},
        [makePlugin('woocommerce', '9.4.2', false)],
        managed('woocommerce'),
      )
      expect(toActivate).toEqual([{file: 'woocommerce/woocommerce', slug: 'woocommerce'}])
    })

    it('puts an installed-but-unmanaged manifest plugin into collisions', () => {
      const {collisions, toPin, toActivate} = diffPlugins({woocommerce: '9.4.2'}, [makePlugin('woocommerce', '9.4.2')])
      expect(collisions).toEqual([{installedVersion: '9.4.2', slug: 'woocommerce'}])
      expect(toPin).toHaveLength(0)
      expect(toActivate).toHaveLength(0)
    })

    it('puts a managed slug dropped from the manifest into toRemove', () => {
      const {toRemove} = diffPlugins({}, [makePlugin('redirection', '5.4.2')], managed('redirection'))
      expect(toRemove).toEqual(['redirection'])
    })

    it('reports an active, unmanaged, unlisted plugin as untrackedActive', () => {
      const {untrackedActive} = diffPlugins({}, [makePlugin('akismet', '5.3')])
      expect(untrackedActive).toEqual(['akismet'])
    })

    it('handles install / pin / activate / remove in one call', () => {
      const manifest = {acf: '6.3.0', 'contact-form-7': '6.0.5', wpcode: '2.1.0'}
      const installed = [
        makePlugin('acf', '6.2.0'),
        makePlugin('wpcode', '2.1.0', false),
        makePlugin('redirection', '5.4.2'),
      ]
      const {toInstall, toPin, toActivate, toRemove} = diffPlugins(
        manifest,
        installed,
        managed('acf', 'wpcode', 'redirection'),
      )
      expect(toInstall).toEqual([{slug: 'contact-form-7', version: '6.0.5'}])
      expect(toPin).toEqual([{from: '6.2.0', slug: 'acf', to: '6.3.0'}])
      expect(toActivate).toEqual([{file: 'wpcode/wpcode', slug: 'wpcode'}])
      expect(toRemove).toEqual(['redirection'])
    })
  })

  describe('lockedWpackagistSlugs', () => {
    const lock = JSON.stringify({
      packages: [
        {name: 'wpackagist-plugin/woocommerce', version: '9.4.2'},
        {name: 'wpackagist-theme/generatepress', version: '3.4.0'},
        {name: 'composer/installers', version: '2.3.0'},
      ],
    })

    it('extracts plugin slugs', () => {
      expect([...lockedWpackagistSlugs(lock, 'plugin')]).toEqual(['woocommerce'])
    })

    it('extracts theme slugs', () => {
      expect([...lockedWpackagistSlugs(lock, 'theme')]).toEqual(['generatepress'])
    })

    it('returns an empty set for a null or unparseable lock', () => {
      expect(lockedWpackagistSlugs(null, 'plugin').size).toBe(0)
      expect(lockedWpackagistSlugs('{not json', 'plugin').size).toBe(0)
    })
  })
})
