import {describe, expect, it} from 'vitest'

import {diffThemes, type InstalledTheme, parseInstalledThemes, type WpNativeTheme} from '../../src/utils/themes.js'

const makeTheme = (slug: string, version: string, active = true): InstalledTheme => ({active, slug, version})

const makeNative = (stylesheet: string, overrides: Partial<WpNativeTheme> = {}): WpNativeTheme => ({
  status: 'inactive',
  stylesheet,
  version: '1.0.0',
  ...overrides,
})

describe('themes', () => {
  describe('parseInstalledThemes', () => {
    it('uses the stylesheet as the slug and maps status "active" to active: true', () => {
      const [active, inactive] = parseInstalledThemes([
        makeNative('twentytwentyfive', {status: 'active'}),
        makeNative('generatepress', {status: 'inactive'}),
      ])
      expect(active).toEqual({active: true, slug: 'twentytwentyfive', version: '1.0.0'})
      expect(inactive).toEqual({active: false, slug: 'generatepress', version: '1.0.0'})
    })
  })

  describe('diffThemes', () => {
    const managed = (...slugs: string[]) => new Set(slugs)

    it('puts a manifest theme missing from the site into toInstall with its wanted version', () => {
      const {toInstall} = diffThemes({generatepress: '3.4.0'}, [])
      expect(toInstall).toEqual([{slug: 'generatepress', version: '3.4.0'}])
    })

    it('puts a managed theme at the pinned version into inSync', () => {
      const {inSync, toPin} = diffThemes(
        {generatepress: '3.4.0'},
        [makeTheme('generatepress', '3.4.0')],
        managed('generatepress'),
      )
      expect(inSync).toEqual(['generatepress'])
      expect(toPin).toHaveLength(0)
    })

    it('puts a managed theme at the wrong version into toPin', () => {
      const {toPin} = diffThemes(
        {generatepress: '3.4.0'},
        [makeTheme('generatepress', '3.3.0')],
        managed('generatepress'),
      )
      expect(toPin).toEqual([{from: '3.3.0', slug: 'generatepress', to: '3.4.0'}])
    })

    it('never reports a version mismatch for a "latest" pin', () => {
      const {inSync, toPin} = diffThemes(
        {generatepress: 'latest'},
        [makeTheme('generatepress', '3.3.0')],
        managed('generatepress'),
      )
      expect(toPin).toHaveLength(0)
      expect(inSync).toEqual(['generatepress'])
    })

    it('puts an installed-but-unmanaged manifest theme into collisions, not toPin', () => {
      const {collisions, toPin} = diffThemes({generatepress: '3.4.0'}, [makeTheme('generatepress', '3.4.0')])
      expect(collisions).toEqual([{installedVersion: '3.4.0', slug: 'generatepress'}])
      expect(toPin).toHaveLength(0)
    })

    it('puts a managed slug dropped from the manifest into toRemove', () => {
      const {toRemove} = diffThemes({}, [makeTheme('astra', '4.0.0')], managed('astra'))
      expect(toRemove).toEqual(['astra'])
    })

    it('does not report an installed theme absent from both the manifest and managed set as anything (no untrackedActive dimension for themes)', () => {
      const diff = diffThemes({}, [makeTheme('twentytwentyfive', '1.0.0')])
      expect(diff.toInstall).toHaveLength(0)
      expect(diff.toPin).toHaveLength(0)
      expect(diff.collisions).toHaveLength(0)
      expect(diff.toRemove).toHaveLength(0)
      expect(diff.inSync).toHaveLength(0)
    })

    it('handles install / pin / remove in one call', () => {
      const manifest = {astra: '4.0.0', generatepress: '3.4.0'}
      const installed = [makeTheme('generatepress', '3.3.0'), makeTheme('oceanwp', '2.0.0')]
      const {toInstall, toPin, toRemove} = diffThemes(manifest, installed, managed('generatepress', 'oceanwp'))

      expect(toInstall).toEqual([{slug: 'astra', version: '4.0.0'}])
      expect(toPin).toEqual([{from: '3.3.0', slug: 'generatepress', to: '3.4.0'}])
      expect(toRemove).toEqual(['oceanwp'])
    })
  })
})
