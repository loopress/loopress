import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {getResourceStateProvider} from '../../src/lib/resource-state.js'
import {materializeSnapshot} from '../../src/lib/rollback-materialize.js'

const noWarn = (): void => {}

// materializeSnapshot's whole job is to write a snapshot's state back to disk in exactly the
// layout `<resource> pull` would have written, so `<resource> push` (which is really just
// `<resource>-provider>.local()` under the hood, see resource-state.ts) can read it back
// unmodified. The round trip through the real resource-state provider's own `local()` reader
// is the actual contract: if this passes, `<resource> push` against the materialized directory
// pushes exactly the snapshotted state.
async function roundTrip(resource: string, state: Record<string, unknown>): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), `lps-rollback-materialize-${resource}-`))
  try {
    await materializeSnapshot(resource, state, dir)
    const read = await getResourceStateProvider(resource).local(dir, noWarn)
    return Object.fromEntries(read)
  } finally {
    rmSync(dir, {force: true, recursive: true})
  }
}

describe('rollback-materialize', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-rollback-materialize-scratch-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('round-trips a snippet', async () => {
    const state = {
      7: {
        active: true,
        code: 'return 1;',
        insertMethod: 'auto',
        location: 'everywhere',
        name: 'Hero',
        priority: 10,
        shortcodeAttributes: [],
        tags: [],
        type: 'php',
      },
    }

    expect(await roundTrip('snippet', state)).toEqual(state)
  })

  it('round-trips a form', async () => {
    const state = {42: {id: 42, settings: {form_title: 'Contact'}}}

    expect(await roundTrip('form', state)).toEqual(state)
  })

  it('round-trips an ACF object', async () => {
    const state = {'field-groups/group_x': {fields: [], key: 'group_x', title: 'Group X'}}

    expect(await roundTrip('acf', state)).toEqual(state)
  })

  it('round-trips an api route file, including a nested path', async () => {
    const state = {
      hello: 'declare(strict_types=1);\n\necho "hi";',
      'invoice-pdf/[order_id]': 'declare(strict_types=1);\n\necho "pdf";',
    }

    expect(await roundTrip('api', state)).toEqual(state)
  })

  it('round-trips a hook file', async () => {
    const state = {'content/filters': 'declare(strict_types=1);\n\n// noop'}

    expect(await roundTrip('hook', state)).toEqual(state)
  })

  it('round-trips SEO settings, post meta, and a redirect', async () => {
    // `hits` is dropped: it's a volatile visit counter (see REDIRECT_VOLATILE_KEYS in
    // resource-state.ts), never part of the canonical state a real snapshot would carry.
    const state = {
      'post-meta/post/hello-world': {meta: {title: 'Hello'}, slug: 'hello-world', title: 'Hello'},
      'redirects/3': {createdAt: '2024-01-01T00:00:00.000Z', headerCode: 301, id: 3, sources: ['/old'], status: 'active', updatedAt: '2024-01-01T00:00:00.000Z', urlTo: '/new'},
      settings: {title: 'Site title'},
    }

    expect(await roundTrip('seo', state)).toEqual(state)
  })

  it('round-trips a menu and menu locations', async () => {
    const state = {
      'menu-locations': {primary: 'main-menu'},
      'menu/main-menu': {items: [], name: 'Main menu', slug: 'main-menu'},
    }

    expect(await roundTrip('menu', state)).toEqual(state)
  })

  it('round-trips an option, defaulting readonly to the same policy `option add` uses', async () => {
    const state = {my_plugin_setting: {autoload: 'yes', value: {enabled: true}}}

    expect(await roundTrip('option', state)).toEqual(state)
  })

  it('protects a known-dangerous option (siteurl) by default even though the snapshot has no readonly flag', async () => {
    await materializeSnapshot('option', {siteurl: {autoload: 'yes', value: 'https://example.com'}}, dir)

    const {readFileSync} = await import('node:fs')
    const local = JSON.parse(readFileSync(join(dir, 'siteurl.json'), 'utf8')) as {readonly?: boolean}

    expect(local.readonly).toBe(true)
  })

  it('round-trips theme styles', async () => {
    const state = {'twentytwentyfour': {settings: {color: {}}, styles: {}}}

    expect(await roundTrip('theme-styles', state)).toEqual(state)
  })

  it('rejects an unsupported resource', async () => {
    await expect(materializeSnapshot('composer', {}, dir)).rejects.toThrow('Rollback is not supported for "composer"')
  })
})
