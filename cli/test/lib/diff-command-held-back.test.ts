import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {WpClient} from '../../src/lib/wp-client.js'

import {excludedFileFor, sharedReads} from '../../src/lib/diff-command.js'
import {activateExclusions} from '../../src/lib/exclude.js'
import {getResourceStateProvider} from '../../src/lib/resource-state.js'

describe('excludedFileFor', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lps-held-back-'))
    activateExclusions({
      config: {environments: {production: {exclude: ['api/foo.json', 'api/bar', 'hooks/games.php', 'blocks/games', 'blocks/quiz.json', 'menus/primary.json', 'theme-styles/twentyfive-global-styles.json']}}},
      cwd: root,
      envName: 'production',
      honors: true,
    })
  })

  afterEach(() => {
    activateExclusions({config: {}, cwd: root, envName: 'production', honors: false})
    rmSync(root, {force: true, recursive: true})
  })

  it('matches a site-only id against the resource own extension only', () => {
    expect(excludedFileFor(join(root, 'api'), 'foo', {fileExtension: '.php'})).toBe(false)
    expect(excludedFileFor(join(root, 'api'), 'bar', {fileExtension: '.php'})).toBe(false)
    expect(excludedFileFor(join(root, 'hooks'), 'games', {fileExtension: '.php'})).toBe(true)
  })

  it('tries every extension when the resource declares none, and the bare path', () => {
    expect(excludedFileFor(join(root, 'api'), 'foo', {})).toBe(true)
    expect(excludedFileFor(join(root, 'blocks'), 'games', {})).toBe(true)
  })

  it('matches a site-only block against its bare folder only', () => {
    expect(excludedFileFor(join(root, 'blocks'), 'games', getResourceStateProvider('block'))).toBe(true)
    expect(excludedFileFor(join(root, 'blocks'), 'quiz', getResourceStateProvider('block'))).toBe(false)
  })

  it('maps menu and Global Styles ids to their file names', () => {
    expect(excludedFileFor(join(root, 'menus'), 'menu/primary', getResourceStateProvider('menu'))).toBe(true)
    expect(excludedFileFor(join(root, 'menus'), 'menu/footer', getResourceStateProvider('menu'))).toBe(false)
    expect(excludedFileFor(join(root, 'theme-styles'), 'twentyfive', getResourceStateProvider('theme-style'))).toBe(true)
  })
})

describe('sharedReads', () => {
  it('reads each path once so both diff sides see the same site response', async () => {
    const get = vi.fn(async (path: string) => ({path, read: get.mock.calls.length}))
    const shared = sharedReads({get} as unknown as WpClient)

    const [first, second] = await Promise.all([shared.get('loopress/v1/blocks'), shared.get('loopress/v1/blocks')])
    await shared.get('loopress/v1/pages')

    expect(first).toBe(second)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
