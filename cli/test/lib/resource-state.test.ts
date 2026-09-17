import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {compareStates, isEmptyDiff} from '../../src/lib/diff-state.js'
import {
  composerLocalState,
  composerRemoteState,
  getResourceStateProvider,
  RESOURCE_STATE_PROVIDERS,
  type ResourceStateProvider,
} from '../../src/lib/resource-state.js'
import {type WpClient} from '../../src/lib/wp-client.js'

const labels = {left: 'remote', right: 'local'}
const noWarn = (): void => {}

function notFound(body?: string): Error {
  return new Error('Not Found', {cause: {response: {body, statusCode: 404}}})
}

// A stand-in for WpClient: every GET (paged or not) resolves to whatever `responses` maps the
// path to, or an empty list so providers that query endpoints this test doesn't care about
// stay silent. `getAll` here is a single lookup, not a real page walk (see wp-client.test.ts
// for the pagination itself).
function fakeWp(responses: Record<string, unknown>): WpClient {
  const lookup = vi.fn(async (path: string) => (Object.hasOwn(responses, path) ? responses[path] : []))
  return {get: lookup, getAll: lookup} as unknown as WpClient
}

function provider(resource: string): ResourceStateProvider {
  const found = RESOURCE_STATE_PROVIDERS.find((p) => p.resource === resource)
  if (!found) throw new Error(`no provider for ${resource}`)
  return found
}

describe('resource-state providers', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-resource-state-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('snippet', () => {
    const snippetProvider = provider('snippet')

    it('matches a pulled PHP snippet on disk against the same snippet on the server', async () => {
      const remote = fakeWp({
        'loopress/v1/snippets': [
          {active: true, code: 'return 1;', description: 'whatever', id: 7, location: 'everywhere', name: 'Do a thing', type: 'php'},
        ],
      })

      // `snippet pull` re-adds the `<?php` opening tag on disk; the sidecar omits defaulted fields.
      writeFileSync(join(dir, '7-do-a-thing.php'), '<?php\n\nreturn 1;')
      writeFileSync(join(dir, '7-do-a-thing.json'), JSON.stringify({active: true, id: 7, location: 'everywhere', name: 'Do a thing', type: 'php'}))

      const diff = compareStates(await snippetProvider.remote(remote, noWarn, dir), await snippetProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('ignores the description field', async () => {
      const remote = fakeWp({
        'loopress/v1/snippets': [{active: false, code: 'x', description: 'Imported from somewhere', id: 3, name: 'S', type: 'js'}],
      })
      writeFileSync(join(dir, '3-s.js'), 'x')
      writeFileSync(join(dir, '3-s.json'), JSON.stringify({active: false, description: 'totally different', id: 3, name: 'S', type: 'js'}))

      const diff = compareStates(await snippetProvider.remote(remote, noWarn, dir), await snippetProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('flags a real code change', async () => {
      const remote = fakeWp({'loopress/v1/snippets': [{active: true, code: 'return 1;', id: 7, name: 'T', type: 'php'}]})
      writeFileSync(join(dir, '7-t.php'), '<?php\n\nreturn 2;')
      writeFileSync(join(dir, '7-t.json'), JSON.stringify({active: true, id: 7, name: 'T', type: 'php'}))

      const diff = compareStates(await snippetProvider.remote(remote, noWarn, dir), await snippetProvider.local(dir, noWarn), labels)

      expect(diff.changed.map((change) => change.id)).toEqual(['7'])
    })

    it('flags a real tags-only change (canonicalSnippet must not drop tags)', async () => {
      const remote = fakeWp({'loopress/v1/snippets': [{active: true, code: 'x', id: 1, name: 'T', tags: ['x'], type: 'php'}]})
      writeFileSync(join(dir, '1-t.php'), 'x')
      writeFileSync(join(dir, '1-t.json'), JSON.stringify({active: true, id: 1, name: 'T', tags: ['y'], type: 'php'}))

      const diff = compareStates(await snippetProvider.remote(remote, noWarn, dir), await snippetProvider.local(dir, noWarn), labels)

      expect(diff.changed[0]?.fields).toEqual(expect.arrayContaining([{from: 'x', kind: 'changed', path: 'tags.0', to: 'y'}]))
    })

    it('flags a real shortcodeAttributes-only change (canonicalSnippet must not drop them)', async () => {
      const remote = fakeWp({
        'loopress/v1/snippets': [{active: true, code: 'x', id: 1, name: 'T', shortcodeAttributes: ['a'], type: 'php'}],
      })
      writeFileSync(join(dir, '1-t.php'), 'x')
      writeFileSync(join(dir, '1-t.json'), JSON.stringify({active: true, id: 1, name: 'T', shortcodeAttributes: ['b'], type: 'php'}))

      const diff = compareStates(await snippetProvider.remote(remote, noWarn, dir), await snippetProvider.local(dir, noWarn), labels)

      expect(diff.changed[0]?.fields).toEqual(
        expect.arrayContaining([{from: 'a', kind: 'changed', path: 'shortcodeAttributes.0', to: 'b'}]),
      )
    })

    it('keys a local snippet with no id by its filename', async () => {
      writeFileSync(join(dir, 'draft.php'), 'x')
      writeFileSync(join(dir, 'draft.json'), JSON.stringify({active: false, name: 'Draft', type: 'php'}))

      const state = await snippetProvider.local(dir, noWarn)

      expect([...state.keys()]).toEqual(['local:draft.php'])
    })

    it('propagates a non-ENOENT error from loadSnippets instead of swallowing it', async () => {
      const filePath = join(dir, 'not-a-dir')
      writeFileSync(filePath, 'x')

      await expect(snippetProvider.local(filePath, noWarn)).rejects.toThrow()
    })
  })

  describe('api', () => {
    const apiProvider = provider('api')

    it('keys route files by their path-relative name, including nested folders', async () => {
      const remote = fakeWp({
        'loopress/v1/api-files': [
          {content: 'a', filename: 'ping'},
          {content: 'b', filename: 'invoice-pdf/[order_id]'},
        ],
      })

      writeFileSync(join(dir, 'ping.php'), 'a')
      mkdirSync(join(dir, 'invoice-pdf'))
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), 'b')

      const diff = compareStates(await apiProvider.remote(remote, noWarn, dir), await apiProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('actually populates state entries by filename (an empty-vs-empty match is not proof it works)', async () => {
      const remote = fakeWp({'loopress/v1/api-files': [{content: 'a', filename: 'ping'}]})

      const state = await apiProvider.remote(remote, noWarn, dir)

      expect([...state]).toEqual([['ping', 'a']])
    })
  })

  describe('hook', () => {
    const hookProvider = provider('hook')

    it('keys hook files by their path-relative name, including nested folders', async () => {
      const remote = fakeWp({
        'loopress/v1/hook-files': [
          {content: 'a', filename: 'cleanup-cron'},
          {content: 'b', filename: 'content/filters'},
        ],
      })

      writeFileSync(join(dir, 'cleanup-cron.php'), 'a')
      mkdirSync(join(dir, 'content'))
      writeFileSync(join(dir, 'content', 'filters.php'), 'b')

      const diff = compareStates(await hookProvider.remote(remote, noWarn, dir), await hookProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })
  })

  describe('form', () => {
    const formProvider = provider('form')

    it('keeps the whole plugin object and keys it by id', async () => {
      const object = {fields: {1: {type: 'text'}}, id: 55, settings: {form_title: 'Contact'}}
      const remote = fakeWp({'loopress/v1/forms': [object]})
      writeFileSync(join(dir, '55-contact.json'), JSON.stringify(object))

      const diff = compareStates(await formProvider.remote(remote, noWarn, dir), await formProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('ignores the modified / modified_gmt save timestamps', async () => {
      const remote = fakeWp({'loopress/v1/forms': [{id: 7, modified: '2026-02-02', modified_gmt: '2026-02-02', settings: {form_title: 'C'}}]})
      writeFileSync(join(dir, '7-c.json'), JSON.stringify({id: 7, modified: '1999-01-01', modified_gmt: '1999-01-01', settings: {form_title: 'C'}}))

      const diff = compareStates(await formProvider.remote(remote, noWarn, dir), await formProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('keys a local file with no id by its filename', async () => {
      writeFileSync(join(dir, 'draft.json'), JSON.stringify({settings: {form_title: 'Draft'}}))

      const state = await formProvider.local(dir, noWarn)

      expect([...state.keys()]).toEqual(['local:draft'])
    })

    it('drops a remote form with no id instead of keying it "undefined"', async () => {
      const remote = fakeWp({'loopress/v1/forms': [{settings: {form_title: 'No ID'}}]})

      const state = await formProvider.remote(remote, noWarn, dir)

      expect([...state.keys()]).toEqual([])
    })
  })

  describe('acf', () => {
    const acfProvider = provider('acf')

    it('namespaces ids by object type', async () => {
      const remote = fakeWp({'loopress/v1/acf/field-groups': [{key: 'group_1', title: 'Hero'}]})
      mkdirSync(join(dir, 'field-groups'))
      writeFileSync(join(dir, 'field-groups', 'group_1.json'), JSON.stringify({key: 'group_1', title: 'Hero'}))

      const state = await acfProvider.remote(remote, noWarn, dir)

      expect([...state.keys()]).toEqual(['field-groups/group_1'])

      const diff = compareStates(state, await acfProvider.local(dir, noWarn), labels)
      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('ignores the modified timestamp ACF stamps on every save', async () => {
      const remote = fakeWp({'loopress/v1/acf/field-groups': [{key: 'group_1', modified: 1_700_000_000, title: 'Hero'}]})
      mkdirSync(join(dir, 'field-groups'))
      writeFileSync(join(dir, 'field-groups', 'group_1.json'), JSON.stringify({key: 'group_1', modified: 1, title: 'Hero'}))

      const diff = compareStates(await acfProvider.remote(remote, noWarn, dir), await acfProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('drops an acf object with no key, both locally and remotely', async () => {
      mkdirSync(join(dir, 'field-groups'))
      writeFileSync(join(dir, 'field-groups', 'x.json'), JSON.stringify({title: 'No key'}))

      const localState = await acfProvider.local(dir, noWarn)
      expect([...localState.keys()]).toEqual([])

      const remote = fakeWp({'loopress/v1/acf/field-groups': [{title: 'No key either'}]})
      const remoteState = await acfProvider.remote(remote, noWarn, dir)
      expect([...remoteState.keys()]).toEqual([])
    })

    it('skips a local json file that is not a plain object (array, null, or scalar)', async () => {
      mkdirSync(join(dir, 'field-groups'))
      writeFileSync(join(dir, 'field-groups', 'arr.json'), '[1,2,3]')
      writeFileSync(join(dir, 'field-groups', 'nil.json'), 'null')
      writeFileSync(join(dir, 'field-groups', 'str.json'), '"nope"')
      writeFileSync(join(dir, 'field-groups', 'good.json'), JSON.stringify({key: 'group_1'}))
      const warnings: string[] = []

      const state = await acfProvider.local(dir, (message) => {
        warnings.push(message)
      })

      expect([...state.keys()]).toEqual(['field-groups/group_1'])
      expect(warnings).toHaveLength(3)
    })
  })

  describe('seo', () => {
    const seoProvider = provider('seo')

    it('drops the volatile hits counter from redirects', async () => {
      const remote = fakeWp({
        'loopress/v1/seo/settings': {titleSep: '-'},
        'loopress/v1/seo/redirects': [{headerCode: 301, hits: 999, id: 4, urlTo: '/new'}],
      })

      writeFileSync(join(dir, 'settings.json'), JSON.stringify({titleSep: '-'}))
      mkdirSync(join(dir, 'redirects'))
      writeFileSync(join(dir, 'redirects', '4-new.json'), JSON.stringify({headerCode: 301, hits: 2, id: 4, urlTo: '/new'}))

      const diff = compareStates(await seoProvider.remote(remote, noWarn, dir), await seoProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('warns and skips redirects when the endpoint is not found', async () => {
      const wp = {
        async get(path: string) {
          if (path === 'loopress/v1/seo/redirects') throw notFound()
          if (path === 'loopress/v1/seo/settings') return {}
          return []
        },
      } as unknown as WpClient
      const warnings: string[] = []

      const state = await seoProvider.remote(
        wp,
        (message) => {
          warnings.push(message)
        },
        dir,
      )

      const keys = [...state.keys()]
      expect(warnings.join('\n')).toContain('redirects')
      expect(keys.filter((key) => key.startsWith('redirects/'))).toHaveLength(0)
    })

    it('does not swallow a non-404 error fetching redirects', async () => {
      const wp = {
        async get(path: string) {
          if (path === 'loopress/v1/seo/redirects') throw new Error('server error', {cause: {response: {statusCode: 500}}})
          if (path === 'loopress/v1/seo/settings') return {}
          return []
        },
      } as unknown as WpClient

      await expect(seoProvider.remote(wp, noWarn, dir)).rejects.toThrow('server error')
    })

    it('excludes a redirect with id <= 0 or a non-integer id', async () => {
      mkdirSync(join(dir, 'redirects'))
      writeFileSync(join(dir, 'redirects', 'a.json'), JSON.stringify({headerCode: 301, id: 0, urlTo: '/a'}))
      writeFileSync(join(dir, 'redirects', 'b.json'), JSON.stringify({headerCode: 301, id: 1.5, urlTo: '/b'}))
      writeFileSync(join(dir, 'redirects', 'c.json'), JSON.stringify({headerCode: 301, id: 7, urlTo: '/c'}))

      const state = await seoProvider.local(dir, noWarn)

      expect([...state.keys()].filter((key) => key.startsWith('redirects/'))).toEqual(['redirects/7'])
    })

    it('stores real redirect content with hits dropped (not a stripped-to-undefined placeholder)', async () => {
      mkdirSync(join(dir, 'redirects'))
      writeFileSync(join(dir, 'redirects', '4-new.json'), JSON.stringify({headerCode: 301, hits: 2, id: 4, urlTo: '/new'}))

      const state = await seoProvider.local(dir, noWarn)

      expect(state.get('redirects/4')).toEqual({headerCode: 301, id: 4, urlTo: '/new'})
    })

    it('reads local seo post-meta files, keyed by post type and slug', async () => {
      mkdirSync(join(dir, 'post-meta', 'post'), {recursive: true})
      writeFileSync(join(dir, 'post-meta', 'post', 'x.json'), JSON.stringify({slug: 'hello-world', title: 'Hello'}))

      const state = await seoProvider.local(dir, noWarn)

      expect(state.get('post-meta/post/hello-world')).toEqual({slug: 'hello-world', title: 'Hello'})
    })

    it('falls back to a "local:" key when a post-meta sidecar has no, or an empty, slug', async () => {
      mkdirSync(join(dir, 'post-meta', 'post'), {recursive: true})
      writeFileSync(join(dir, 'post-meta', 'post', 'draft.json'), JSON.stringify({title: 'No slug'}))
      writeFileSync(join(dir, 'post-meta', 'post', 'blank.json'), JSON.stringify({slug: '', title: 'Blank slug'}))

      const state = await seoProvider.local(dir, noWarn)

      expect([...state.keys()].filter((key) => key.startsWith('post-meta/'))).toEqual(
        expect.arrayContaining(['post-meta/post/local:draft', 'post-meta/post/local:blank']),
      )
    })

    it('does not warn when settings.json is simply absent (ENOENT is not an error)', async () => {
      const warnings: string[] = []

      await seoProvider.local(dir, (message) => {
        warnings.push(message)
      })

      expect(warnings).toEqual([])
    })

    it('warns on a non-ENOENT error reading settings.json, unlike a merely-missing file', async () => {
      mkdirSync(join(dir, 'settings.json')) // a directory, not a file: EISDIR
      const warnings: string[] = []

      await seoProvider.local(dir, (message) => {
        warnings.push(message)
      })

      expect(warnings.some((message) => message.includes('settings.json'))).toBe(true)
    })

    it('reads remote seo post-meta per post type, keyed by slug', async () => {
      const remote = fakeWp({
        'loopress/v1/seo/post-meta/post': [{meta: {}, slug: 'hello-world', title: 'Hello'}],
        'loopress/v1/seo/settings': {},
      })

      const state = await seoProvider.remote(remote, noWarn, dir)

      expect(state.get('post-meta/post/hello-world')).toEqual({meta: {}, slug: 'hello-world', title: 'Hello'})
    })
  })

  describe('menu', () => {
    const menuProvider = provider('menu')

    it('namespaces menus by slug and reads the active theme locations under a fixed key', async () => {
      const remote = fakeWp({
        'loopress/v1/menu-locations': {primary: 'main'},
        'loopress/v1/menus': [{items: [], name: 'Main', slug: 'main', warnings: []}],
      })
      writeFileSync(join(dir, 'main.json'), JSON.stringify({items: [], name: 'Main', slug: 'main', warnings: []}))
      writeFileSync(join(dir, 'menu-locations.json'), JSON.stringify({primary: 'main'}))

      const state = await menuProvider.remote(remote, noWarn, dir)

      expect([...state.keys()].sort((a, b) => a.localeCompare(b))).toEqual(['menu-locations', 'menu/main'])
      expect(state.get('menu-locations')).toEqual({primary: 'main'})

      const diff = compareStates(state, await menuProvider.local(dir, noWarn), labels)
      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('ignores warnings: diagnostic only, never tracked configuration', async () => {
      const remote = fakeWp({
        'loopress/v1/menu-locations': {},
        'loopress/v1/menus': [{items: [], name: 'Main', slug: 'main', warnings: ['item 4 references a deleted page']}],
      })
      writeFileSync(join(dir, 'main.json'), JSON.stringify({items: [], name: 'Main', slug: 'main', warnings: []}))
      writeFileSync(join(dir, 'menu-locations.json'), JSON.stringify({}))

      const diff = compareStates(await menuProvider.remote(remote, noWarn, dir), await menuProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('drops a remote menu with no slug', async () => {
      const remote = fakeWp({
        'loopress/v1/menu-locations': {},
        'loopress/v1/menus': [{items: [], name: 'No slug', warnings: []}],
      })

      const state = await menuProvider.remote(remote, noWarn, dir)

      expect([...state.keys()]).toEqual(['menu-locations'])
    })

    it('falls back to a "local:" key for a local menu file with no, or an empty, slug', async () => {
      writeFileSync(join(dir, 'draft.json'), JSON.stringify({items: [], name: 'Draft', warnings: []}))
      writeFileSync(join(dir, 'blank.json'), JSON.stringify({items: [], name: 'Blank', slug: '', warnings: []}))

      const state = await menuProvider.local(dir, noWarn)

      expect([...state.keys()]).toEqual(expect.arrayContaining(['menu/local:draft', 'menu/local:blank']))
    })

    it('reads menu-locations.json as its own fixed "menu-locations" entry, separate from any menu', async () => {
      writeFileSync(join(dir, 'main.json'), JSON.stringify({items: [], name: 'Main', slug: 'main', warnings: []}))
      writeFileSync(join(dir, 'menu-locations.json'), JSON.stringify({footer: null, primary: 'main'}))

      const state = await menuProvider.local(dir, noWarn)

      expect(state.get('menu-locations')).toEqual({footer: null, primary: 'main'})
      expect(state.get('menu/main')).toEqual({items: [], name: 'Main', slug: 'main'})
    })
  })

  describe('theme-styles', () => {
    const themeStylesProvider = provider('theme-styles')
    const activeTheme = (extra: Record<string, unknown> = {}) => ({
      _links: {'wp:user-global-styles': [{href: 'https://example.com/wp-json/wp/v2/global-styles/7'}]},
      status: 'active',
      stylesheet: 'twentytwentyfour',
      theme_supports: {'block-templates': true},
      ...extra,
    })

    it('reads the active block theme Global Styles, keyed by stylesheet', async () => {
      const remote = fakeWp({
        'wp/v2/global-styles/7': {settings: {color: {palette: []}}, styles: {}},
        'wp/v2/themes': [activeTheme()],
      })

      const state = await themeStylesProvider.remote(remote, noWarn, dir)

      expect([...state]).toEqual([['twentytwentyfour', {settings: {color: {palette: []}}, styles: {}}]])
    })

    it('drops WordPress bookkeeping (id, _links) from the compared value', async () => {
      const remote = fakeWp({
        'wp/v2/global-styles/7': {_links: {self: [{href: 'x'}]}, id: 7, settings: {}, styles: {}},
        'wp/v2/themes': [activeTheme()],
      })

      const state = await themeStylesProvider.remote(remote, noWarn, dir)

      expect(state.get('twentytwentyfour')).toEqual({settings: {}, styles: {}})
    })

    it('rejects a classic active theme with a clear error instead of a raw REST failure', async () => {
      const remote = fakeWp({
        'wp/v2/themes': [{status: 'active', stylesheet: 'astra', theme_supports: {'block-templates': false}}],
      })

      await expect(themeStylesProvider.remote(remote, noWarn, dir)).rejects.toThrow(/classic theme/)
    })

    it('matches a pulled file against the same active theme on the server', async () => {
      const remote = fakeWp({
        'wp/v2/global-styles/7': {settings: {color: {}}, styles: {}},
        'wp/v2/themes': [activeTheme()],
      })
      writeFileSync(join(dir, 'twentytwentyfour-global-styles.json'), JSON.stringify({settings: {color: {}}, styles: {}}))

      const diff = compareStates(await themeStylesProvider.remote(remote, noWarn, dir), await themeStylesProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    it('keys local files by the stylesheet slug parsed from the "<slug>-global-styles.json" filename', async () => {
      writeFileSync(join(dir, 'twentytwentyfour-global-styles.json'), JSON.stringify({settings: {}, styles: {}}))

      const state = await themeStylesProvider.local(dir, noWarn)

      expect([...state.keys()]).toEqual(['twentytwentyfour'])
    })

    it('flags a real styles change', async () => {
      const remote = fakeWp({
        'wp/v2/global-styles/7': {settings: {}, styles: {color: {background: '#fff'}}},
        'wp/v2/themes': [activeTheme()],
      })
      writeFileSync(
        join(dir, 'twentytwentyfour-global-styles.json'),
        JSON.stringify({settings: {}, styles: {color: {background: '#000'}}}),
      )

      const diff = compareStates(await themeStylesProvider.remote(remote, noWarn, dir), await themeStylesProvider.local(dir, noWarn), labels)

      expect(diff.changed.map((change) => change.id)).toEqual(['twentytwentyfour'])
    })
  })

  describe('option', () => {
    const optionsProvider = provider('option')

    it('compares only the locally tracked names, fetched by GET /options/{name}', async () => {
      const remote = fakeWp({
        'loopress/v1/options/blogname': {autoload: 'yes', name: 'blogname', value: 'New'},
        // Not tracked locally: never fetched, and must never leak into either state.
        'loopress/v1/options/untracked_option': {autoload: 'yes', name: 'untracked_option', value: 'ignored'},
      })
      writeFileSync(join(dir, 'blogname.json'), JSON.stringify({autoload: 'yes', name: 'blogname', value: 'Old'}))

      const diff = compareStates(await optionsProvider.remote(remote, noWarn, dir), await optionsProvider.local(dir, noWarn), labels)

      expect(diff.changed.map((change) => change.id)).toEqual(['blogname'])
    })

    it('ignores the local-only readonly flag, it never shows up as drift', async () => {
      const remote = fakeWp({'loopress/v1/options/siteurl': {autoload: 'yes', name: 'siteurl', value: 'https://example.com'}})
      writeFileSync(join(dir, 'siteurl.json'), JSON.stringify({autoload: 'yes', name: 'siteurl', readonly: true, value: 'https://example.com'}))

      const diff = compareStates(await optionsProvider.remote(remote, noWarn, dir), await optionsProvider.local(dir, noWarn), labels)

      expect(isEmptyDiff(diff)).toBe(true)
    })

    // A tracked option that no longer exists on this environment (never pushed here, or
    // deleted there) is left out of the remote map entirely, rather than erroring the whole
    // comparison: it reads as "added" (present locally, not on this site), the same signal a
    // file that was never pushed anywhere gets.
    it('treats a 404 for a tracked name as absent on that side, not a failure', async () => {
      const remote = {
        async get(path: string) {
          if (path === 'loopress/v1/options/ghost') throw notFound()
          throw new Error(`unexpected request: ${path}`)
        },
      } as unknown as WpClient
      writeFileSync(join(dir, 'ghost.json'), JSON.stringify({autoload: 'yes', name: 'ghost', value: 'x'}))

      const diff = compareStates(await optionsProvider.remote(remote, noWarn, dir), await optionsProvider.local(dir, noWarn), labels)

      expect(diff.added).toEqual(['ghost'])
    })

    it('does not swallow a non-404 error fetching an option', async () => {
      const remote = {
        async get(path: string) {
          if (path === 'loopress/v1/options/ghost') throw new Error('boom', {cause: {response: {statusCode: 500}}})
          throw new Error(`unexpected request: ${path}`)
        },
      } as unknown as WpClient
      writeFileSync(join(dir, 'ghost.json'), JSON.stringify({autoload: 'yes', name: 'ghost', value: 'x'}))

      await expect(optionsProvider.remote(remote, noWarn, dir)).rejects.toThrow('boom')
    })
  })
})

describe('getResourceStateProvider', () => {
  it('returns the matching provider', () => {
    expect(getResourceStateProvider('snippet').resource).toBe('snippet')
  })

  it('throws for an unknown resource', () => {
    expect(() => getResourceStateProvider('ghost')).toThrow(/No resource-state provider/)
  })
})

describe('composer state', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-composer-state-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('compares composer.json and composer.lock as text', async () => {
    const wp = fakeWp({
      'loopress/v1/composer/json': {composerJson: '{\n  "name": "acme/site"\n}\n'},
      'loopress/v1/composer/lock': {composerLock: '{\n  "packages": []\n}\n'},
    })

    writeFileSync(join(dir, 'composer.json'), '{\n  "name": "acme/site"\n}\n')
    writeFileSync(join(dir, 'composer.lock'), '{\n  "packages": []\n}\n')

    const diff = compareStates(await composerRemoteState(wp), await composerLocalState(dir), labels)

    expect(isEmptyDiff(diff)).toBe(true)
  })

  it('reports composer.lock present remotely but absent locally', async () => {
    const wp = fakeWp({
      'loopress/v1/composer/json': {composerJson: '{}'},
      'loopress/v1/composer/lock': {composerLock: '{}'},
    })
    writeFileSync(join(dir, 'composer.json'), '{}')

    const diff = compareStates(await composerRemoteState(wp), await composerLocalState(dir), labels)

    expect(diff.removed).toEqual(['composer.lock'])
  })

  it('treats a missing composer.lock as never-pushed, not a failure', async () => {
    const wp = {
      async get(path: string) {
        if (path === 'loopress/v1/composer/json') return {composerJson: '{}'}
        if (path === 'loopress/v1/composer/lock') throw notFound(JSON.stringify({error: 'composer.lock not found'}))
        throw new Error(`unexpected request: ${path}`)
      },
    } as unknown as WpClient

    const state = await composerRemoteState(wp)

    expect([...state.keys()]).toEqual(['composer.json'])
  })

  it('propagates a non-404 error fetching composer.lock', async () => {
    const wp = {
      async get(path: string) {
        if (path === 'loopress/v1/composer/json') return {composerJson: '{}'}
        if (path === 'loopress/v1/composer/lock') throw new Error('boom', {cause: {response: {statusCode: 500}}})
        throw new Error(`unexpected request: ${path}`)
      },
    } as unknown as WpClient

    await expect(composerRemoteState(wp)).rejects.toThrow('boom')
  })

  it('propagates a non-ENOENT error reading a local composer file', async () => {
    mkdirSync(join(dir, 'composer.json')) // a directory, not a file: EISDIR, unlike a merely-missing file

    await expect(composerLocalState(dir)).rejects.toThrow()
  })
})
