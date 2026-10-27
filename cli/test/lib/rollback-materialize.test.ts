import {mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs'
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

    const local = JSON.parse(readFileSync(join(dir, 'siteurl.json'), 'utf8')) as {readonly?: boolean}

    expect(local.readonly).toBe(true)
  })

  it('round-trips theme styles', async () => {
    const state = {'twentytwentyfour': {settings: {color: {}}, styles: {}}}

    expect(await roundTrip('theme-styles', state)).toEqual(state)
  })

  it.each([
    ['cpt', {book: {public: true}}],
    ['taxonomy', {genre: {object_type: ['book']}}],
    ['meta', {book: {isbn: {type: 'string'}}}],
    ['role', {client: {capabilities: {read: true}, name: 'Client'}}],
    ['pattern', {hero: {content: '<p>Hi</p>', title: 'Hero'}}],
  ])('round-trips a %s', async (resource, state) => {
    expect(await roundTrip(resource, state)).toEqual(state)
  })

  it('names a form without its own id or title after the snapshot id', async () => {
    await materializeSnapshot('form', {42: {settings: {}}}, dir)

    expect(readdirSync(dir)).toEqual(['42-untitled.json'])
    expect(readFileSync(join(dir, '42-untitled.json'), 'utf8')).toBe('{\n  "settings": {}\n}\n')
  })

  it('names an ACF object without a key after the snapshot id', async () => {
    await materializeSnapshot('acf', {'field-groups/group_x': {title: 'X'}}, dir)

    expect(readdirSync(join(dir, 'field-groups'))).toEqual(['group_x.json'])
  })

  it('names a menu without a slug after the snapshot id', async () => {
    await materializeSnapshot('menu', {'menu/main': {items: []}}, dir)

    expect(readdirSync(dir)).toEqual(['main.json'])
  })

  it('rejects a snippet entry whose code is not a string, instead of writing it coerced', async () => {
    await expect(materializeSnapshot('snippet', {7: {code: 42, name: 'Hero', type: 'php'}}, dir)).rejects.toThrow('Snapshot entry "7" has a non-string "code".')
  })

  it('rejects an unsupported resource', async () => {
    await expect(materializeSnapshot('composer', {}, dir)).rejects.toThrow('Rollback is not supported for "composer"')
  })
})
