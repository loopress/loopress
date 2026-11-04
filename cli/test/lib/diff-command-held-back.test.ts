import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {excludedFileFor} from '../../src/lib/diff-command.js'
import {activateExclusions} from '../../src/lib/exclude.js'

describe('excludedFileFor', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lps-held-back-'))
    activateExclusions({
      config: {environments: {production: {exclude: ['api/foo.json', 'hooks/games.php', 'blocks/games']}}},
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
    expect(excludedFileFor(join(root, 'api'), 'foo', '.php')).toBe(false)
    expect(excludedFileFor(join(root, 'hooks'), 'games', '.php')).toBe(true)
  })

  it('tries every extension when the resource declares none, and the bare path', () => {
    expect(excludedFileFor(join(root, 'api'), 'foo', undefined)).toBe(true)
    expect(excludedFileFor(join(root, 'blocks'), 'games', undefined)).toBe(true)
  })
})
