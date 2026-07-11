import {describe, expect, it} from 'vitest'

import {InstalledPlugin, WpNativePlugin} from '../../src/types/plugin.js'
import {diffPlugins, mergePluginManifest, parseInstalledPlugins} from '../../src/utils/plugins.js'

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
  status: 'active',
  version: '1.0.0',
  ...overrides,
})

describe('plugins', () => {
  describe('mergePluginManifest', () => {
    it('adds all plugins when existing manifest is empty', () => {
      const {added, merged, updated} = mergePluginManifest({}, {woocommerce: 'latest', acf: 'latest'})
      expect(merged).toEqual({woocommerce: 'latest', acf: 'latest'})
      expect([...added].sort()).toEqual(['acf', 'woocommerce'])
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

    it('filters out the Loopress plugin itself', () => {
      const result = parseInstalledPlugins([makeNative('loopress/loopress'), makeNative('woocommerce/woocommerce')])
      expect(result.map((p) => p.slug)).toEqual(['woocommerce'])
    })
  })

  describe('diffPlugins', () => {
    it('puts a manifest plugin missing from site into toInstall', () => {
      const {toInstall, upToDate, toActivate} = diffPlugins({woocommerce: 'latest'}, [])
      expect(toInstall).toEqual([{slug: 'woocommerce'}])
      expect(upToDate).toHaveLength(0)
      expect(toActivate).toHaveLength(0)
    })

    it('puts an active installed plugin into upToDate', () => {
      const {upToDate, toInstall, toActivate} = diffPlugins({woocommerce: 'latest'}, [makePlugin('woocommerce', '8.9.1')])
      expect(upToDate).toEqual(['woocommerce'])
      expect(toInstall).toHaveLength(0)
      expect(toActivate).toHaveLength(0)
    })

    it('puts an installed-but-inactive plugin into toActivate with its native file id', () => {
      const {toActivate, upToDate, toInstall} = diffPlugins({woocommerce: 'latest'}, [makePlugin('woocommerce', '8.9.1', false)])
      expect(toActivate).toEqual([{file: 'woocommerce/woocommerce', slug: 'woocommerce'}])
      expect(upToDate).toHaveLength(0)
      expect(toInstall).toHaveLength(0)
    })

    it('ignores installed plugins that are not in the manifest', () => {
      const {toInstall, upToDate, toActivate} = diffPlugins({}, [makePlugin('woocommerce', '8.9.1')])
      expect(toInstall).toHaveLength(0)
      expect(upToDate).toHaveLength(0)
      expect(toActivate).toHaveLength(0)
    })

    it('handles mixed install / up-to-date / activate in one call', () => {
      const manifest = {
        acf: 'latest',
        'contact-form-7': 'latest',
        wpcode: 'latest',
      }
      const installed = [makePlugin('acf', '6.0.0'), makePlugin('wpcode', '2.0.0', false)]

      const {toInstall, upToDate, toActivate} = diffPlugins(manifest, installed)

      expect(toInstall).toEqual([{slug: 'contact-form-7'}])
      expect(upToDate).toEqual(['acf'])
      expect(toActivate).toEqual([{file: 'wpcode/wpcode', slug: 'wpcode'}])
    })

    it('returns all empty arrays for an empty manifest', () => {
      const result = diffPlugins({}, [makePlugin('woocommerce', '8.9.1')])
      expect(result.toInstall).toHaveLength(0)
      expect(result.upToDate).toHaveLength(0)
      expect(result.toActivate).toHaveLength(0)
    })
  })
})
