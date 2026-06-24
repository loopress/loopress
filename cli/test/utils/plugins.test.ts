import {expect} from 'chai'

import {resolvePluginVersion} from '../../src/commands/plugins/add.js'
import {InstalledPlugin} from '../../src/types/plugin.js'
import {diffPlugins, mergePluginManifest} from '../../src/utils/plugins.js'

const makePlugin = (slug: string, version: string, active = true): InstalledPlugin => ({
  active,
  file: `${slug}/${slug}.php`,
  name: slug,
  slug,
  version,
})

describe('plugins', () => {
  describe('mergePluginManifest', () => {
    it('adds all plugins when existing manifest is empty', () => {
      const {added, merged, updated} = mergePluginManifest({}, {'woocommerce': '8.9.1', 'acf': '6.3.2'})
      expect(merged).to.deep.equal({'woocommerce': '8.9.1', 'acf': '6.3.2'})
      expect(added).to.have.members(['woocommerce', 'acf'])
      expect(updated).to.be.empty
    })

    it('keeps existing plugins that are not in incoming', () => {
      const {merged} = mergePluginManifest({'wpcode': '2.0.0'}, {'woocommerce': '8.9.1'})
      expect(merged).to.have.property('wpcode', '2.0.0')
      expect(merged).to.have.property('woocommerce', '8.9.1')
    })

    it('updates a plugin version present in both existing and incoming', () => {
      const {merged, updated, added} = mergePluginManifest(
        {'woocommerce': '8.9.1'},
        {'woocommerce': '9.0.0'},
      )
      expect(merged).to.deep.equal({'woocommerce': '9.0.0'})
      expect(updated).to.deep.equal([{from: '8.9.1', slug: 'woocommerce', to: '9.0.0'}])
      expect(added).to.be.empty
    })

    it('does not report a plugin as updated when the version is unchanged', () => {
      const {updated, added} = mergePluginManifest({'woocommerce': '8.9.1'}, {'woocommerce': '8.9.1'})
      expect(updated).to.be.empty
      expect(added).to.be.empty
    })

    it('handles an empty incoming manifest without touching existing entries', () => {
      const {merged, added, updated} = mergePluginManifest({'woocommerce': '8.9.1'}, {})
      expect(merged).to.deep.equal({'woocommerce': '8.9.1'})
      expect(added).to.be.empty
      expect(updated).to.be.empty
    })

    it('reports added and updated separately in the same call', () => {
      const {added, updated} = mergePluginManifest(
        {'woocommerce': '8.9.1'},
        {'woocommerce': '9.0.0', 'acf': '6.0.0'},
      )
      expect(added).to.deep.equal(['acf'])
      expect(updated).to.deep.equal([{from: '8.9.1', slug: 'woocommerce', to: '9.0.0'}])
    })
  })

  describe('diffPlugins', () => {
    it('puts a manifest plugin missing from site into toInstall', () => {
      const {toInstall, drifted, upToDate} = diffPlugins(
        {'woocommerce': '8.9.1'},
        [],
      )
      expect(toInstall).to.deep.equal([{slug: 'woocommerce', targetVersion: '8.9.1'}])
      expect(drifted).to.be.empty
      expect(upToDate).to.be.empty
    })

    it('puts a version-matched plugin into upToDate', () => {
      const {upToDate, toInstall, drifted} = diffPlugins(
        {'woocommerce': '8.9.1'},
        [makePlugin('woocommerce', '8.9.1')],
      )
      expect(upToDate).to.deep.equal(['woocommerce'])
      expect(toInstall).to.be.empty
      expect(drifted).to.be.empty
    })

    it('puts a version-mismatched plugin into drifted', () => {
      const {drifted, toInstall, upToDate} = diffPlugins(
        {'woocommerce': '8.9.1'},
        [makePlugin('woocommerce', '9.0.0')],
      )
      expect(drifted).to.deep.equal([{currentVersion: '9.0.0', slug: 'woocommerce', targetVersion: '8.9.1'}])
      expect(toInstall).to.be.empty
      expect(upToDate).to.be.empty
    })

    it('ignores installed plugins that are not in the manifest', () => {
      const {toInstall, drifted, upToDate} = diffPlugins(
        {},
        [makePlugin('woocommerce', '8.9.1')],
      )
      expect(toInstall).to.be.empty
      expect(drifted).to.be.empty
      expect(upToDate).to.be.empty
    })

    it('handles mixed install / drift / up-to-date in one call', () => {
      const manifest = {
        'acf': '6.3.2',
        'contact-form-7': '5.9.0',
        'woocommerce': '8.9.1',
      }
      const installed = [
        makePlugin('woocommerce', '8.9.1'),
        makePlugin('acf', '6.0.0'),
      ]

      const {toInstall, drifted, upToDate} = diffPlugins(manifest, installed)

      expect(toInstall).to.deep.equal([{slug: 'contact-form-7', targetVersion: '5.9.0'}])
      expect(drifted).to.deep.equal([{currentVersion: '6.0.0', slug: 'acf', targetVersion: '6.3.2'}])
      expect(upToDate).to.deep.equal(['woocommerce'])
    })

    it('returns all empty arrays for an empty manifest', () => {
      const result = diffPlugins({}, [makePlugin('woocommerce', '8.9.1')])
      expect(result.toInstall).to.be.empty
      expect(result.drifted).to.be.empty
      expect(result.upToDate).to.be.empty
    })
  })

  describe('resolvePluginVersion', () => {
    it('returns the version as-is when an explicit version is given', async () => {
      const version = await resolvePluginVersion('woocommerce', '8.9.1')
      expect(version).to.equal('8.9.1')
    })

    it('resolves "latest" to a semver string from WordPress.org', async () => {
      const version = await resolvePluginVersion('woocommerce', 'latest')
      expect(version).to.match(/^\d+\.\d+(\.\d+)?$/)
    })

    it('throws for an unknown slug', async () => {
      try {
        await resolvePluginVersion('this-plugin-does-not-exist-xyzxyz', 'latest')
        expect.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('not found on WordPress.org')
      }
    })
  })
})
