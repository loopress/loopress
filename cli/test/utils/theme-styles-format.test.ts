import {describe, expect, it} from 'vitest'

import {type WpClient} from '../../src/lib/wp-client.js'
import {
  canonicalGlobalStyles,
  getActiveThemeGlobalStyles,
  getUserGlobalStylesId,
  globalStylesEndpoint,
  isBlockTheme,
  themeStylesFileName,
  type WpThemeSupportInfo,
} from '../../src/utils/theme-styles-format.js'

function fakeWp(themes: WpThemeSupportInfo[]): WpClient {
  return {
    async get() {
      return themes
    },
  } as unknown as WpClient
}

const userGlobalStylesLink = (id: number) => ({
  'wp:user-global-styles': [{href: `https://example.com/wp-json/wp/v2/global-styles/${id}`}],
})

describe('theme-styles-format', () => {
  it('builds the theme file name from a stylesheet slug', () => {
    expect(themeStylesFileName('twentytwentyfour')).toBe('twentytwentyfour-global-styles.json')
  })

  it('builds the global styles post endpoint', () => {
    expect(globalStylesEndpoint(42)).toBe('wp/v2/global-styles/42')
  })

  describe('isBlockTheme', () => {
    it('is true when the theme supports block-templates', () => {
      expect(isBlockTheme({theme_supports: {'block-templates': true}})).toBe(true)
    })

    it('is false for a classic theme', () => {
      expect(isBlockTheme({theme_supports: {'block-templates': false}})).toBe(false)
      expect(isBlockTheme({theme_supports: {}})).toBe(false)
      expect(isBlockTheme({})).toBe(false)
    })
  })

  describe('getUserGlobalStylesId', () => {
    it('extracts the numeric id from the wp:user-global-styles link, on the "pretty" permalink shape', () => {
      expect(getUserGlobalStylesId({_links: userGlobalStylesLink(123)})).toBe(123)
    })

    it('extracts the numeric id from the plain-permalink ?rest_route= shape too', () => {
      const item = {_links: {'wp:user-global-styles': [{href: 'https://example.com/?rest_route=/wp/v2/global-styles/456'}]}}

      expect(getUserGlobalStylesId(item)).toBe(456)
    })

    it('returns null when the link is absent', () => {
      expect(getUserGlobalStylesId({})).toBeNull()
    })
  })

  describe('getActiveThemeGlobalStyles', () => {
    it('returns the active block theme stylesheet and its editable global styles post id', async () => {
      const wp = fakeWp([
        {_links: userGlobalStylesLink(1), status: 'inactive', stylesheet: 'astra', theme_supports: {'block-templates': false}},
        {
          _links: userGlobalStylesLink(123),
          status: 'active',
          stylesheet: 'twentytwentyfour',
          theme_supports: {'block-templates': true},
        },
      ])

      await expect(getActiveThemeGlobalStyles(wp)).resolves.toEqual({id: 123, stylesheet: 'twentytwentyfour'})
    })

    it('throws a clear error when the active theme is a classic theme', async () => {
      const wp = fakeWp([{status: 'active', stylesheet: 'astra', theme_supports: {'block-templates': false}}])

      await expect(getActiveThemeGlobalStyles(wp)).rejects.toThrow(/classic theme/)
    })

    it('throws when no theme is reported active', async () => {
      const wp = fakeWp([{status: 'inactive', stylesheet: 'astra'}])

      await expect(getActiveThemeGlobalStyles(wp)).rejects.toThrow(/Could not determine the active theme/)
    })

    it('throws a clear error when the active block theme has no resolvable global styles link', async () => {
      const wp = fakeWp([{status: 'active', stylesheet: 'twentytwentyfour', theme_supports: {'block-templates': true}}])

      await expect(getActiveThemeGlobalStyles(wp)).rejects.toThrow(/Could not resolve the editable Global Styles post/)
    })
  })

  describe('canonicalGlobalStyles', () => {
    it('keeps only settings and styles', () => {
      expect(canonicalGlobalStyles({id: 1, settings: {color: {}}, styles: {typography: {}}} as never)).toEqual({
        settings: {color: {}},
        styles: {typography: {}},
      })
    })

    it('defaults missing settings/styles to empty objects', () => {
      expect(canonicalGlobalStyles({})).toEqual({settings: {}, styles: {}})
    })
  })

  describe('exact values and edge cases', () => {
    it('requires block-templates to be exactly true', () => {
      expect(isBlockTheme({theme_supports: {'block-templates': 'true'}})).toBe(false)
      expect(isBlockTheme({theme_supports: {'block-templates': 1}})).toBe(false)
    })

    it.each([
      ['an empty link list', {'wp:user-global-styles': []}],
      ['a link with an empty href', {'wp:user-global-styles': [{href: ''}]}],
      ['a link to another route', {'wp:user-global-styles': [{href: 'https://example.com/wp-json/wp/v2/themes/7'}]}],
      ['a link with a non-numeric id', {'wp:user-global-styles': [{href: 'https://example.com/wp-json/wp/v2/global-styles/abc'}]}],
      ['another relation only', {self: [{href: 'https://example.com/wp-json/wp/v2/global-styles/9'}]}],
    ])('returns null for %s', (_label, links) => {
      expect(getUserGlobalStylesId({_links: links})).toBeNull()
    })

    it('reads a multi-digit id completely', () => {
      expect(getUserGlobalStylesId({_links: userGlobalStylesLink(98_765)})).toBe(98_765)
    })

    it('reads the themes collection and uses the exact error messages', async () => {
      const get = async (path: string) => {
        expect(path).toBe('wp/v2/themes')
        return [{status: 'active', stylesheet: 'astra'}]
      }

      await expect(getActiveThemeGlobalStyles({get} as unknown as WpClient)).rejects.toThrow(
        'Global Styles sync only supports block themes (Full Site Editing). The active theme "astra" is a classic theme.',
      )
      await expect(getActiveThemeGlobalStyles(fakeWp([]))).rejects.toThrow(/^Could not determine the active theme on WordPress\.$/)
      await expect(
        getActiveThemeGlobalStyles(fakeWp([{status: 'active', stylesheet: 'tt4', theme_supports: {'block-templates': true}}])),
      ).rejects.toThrow(
        'Could not resolve the editable Global Styles post for "tt4". Requires an admin-capable account (edit_theme_options) on WordPress 5.9+.',
      )
    })

    it('defaults only a null or missing value, keeping any other falsy one', () => {
      expect(canonicalGlobalStyles({settings: null, styles: 0})).toEqual({settings: {}, styles: 0})
    })
  })
})
