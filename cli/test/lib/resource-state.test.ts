import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {compareStates, isEmptyDiff} from '../../src/lib/diff-state.js'
import {
  composerLocalState,
  composerRemoteState,
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
})
