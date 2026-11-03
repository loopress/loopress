import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {activateExclusions, globToRegExp, heldBackPaths, isExcluded, matchesAny, withoutExclusions} from '../../src/lib/exclude.js'
import {readdirTolerant, walkFiles} from '../../src/lib/readdir-tolerant.js'

describe('globToRegExp', () => {
  it.each([
    ['cpt/games.json', 'cpt/games.json', true],
    ['cpt/games.json', 'cpt/other.json', false],
    ['theme/templates/*-games.html', 'theme/templates/single-games.html', true],
    ['theme/templates/*-games.html', 'theme/templates/sub/single-games.html', false],
    ['hooks/**/*.php', 'hooks/a/b/c.php', true],
    ['hooks/**/*.php', 'hooks/c.php', true],
    ['hooks/?.php', 'hooks/a.php', true],
    ['./meta/games.json', 'meta/games.json', true],
    ['meta/games.json', 'meta/gamesxjson', false],
  ])('%s against %s is %s', (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected)
  })
})

describe('matchesAny', () => {
  it('matches a file under an excluded directory', () => {
    expect(matchesAny([globToRegExp('apps/games/')], ['apps', 'games', 'dist', 'app.js'])).toBe(true)
    expect(matchesAny([globToRegExp('apps/games')], ['apps', 'catalogue', 'dist', 'app.js'])).toBe(false)
  })
})

describe('exclusions in the listing layer', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lps-exclude-'))
    mkdirSync(join(root, 'hooks', 'feature'), {recursive: true})
    writeFileSync(join(root, 'hooks', 'live.php'), '')
    writeFileSync(join(root, 'hooks', 'games.php'), '')
    writeFileSync(join(root, 'hooks', 'feature', 'page.php'), '')
  })

  afterEach(() => {
    activateExclusions({config: {}, cwd: root, envName: 'production', honors: false})
    rmSync(root, {force: true, recursive: true})
  })

  const activate = (envName: string, honors = true): void => {
    activateExclusions({
      config: {environments: {production: {exclude: ['hooks/games.php', 'hooks/feature']}}},
      cwd: root,
      envName,
      honors,
    })
  }

  it('hides the excluded files of the environment and records them as held back', async () => {
    activate('production')

    expect(await walkFiles(join(root, 'hooks'))).toEqual(['live.php'])
    expect((await readdirTolerant(join(root, 'hooks'))).toSorted((a, b) => a.localeCompare(b))).toEqual(['live.php'])
    expect(heldBackPaths()).toEqual(['hooks/feature', 'hooks/feature/page.php', 'hooks/games.php'])
    expect(isExcluded(join(root, 'hooks', 'feature', 'new.php'))).toBe(true)
  })

  it('lists everything inside withoutExclusions', async () => {
    activate('production')

    expect((await withoutExclusions(async () => walkFiles(join(root, 'hooks')))).toSorted((a, b) => a.localeCompare(b))).toEqual(['feature/page.php', 'games.php', 'live.php'])
  })

  it('leaves other environments, and commands that do not honor it, alone', async () => {
    activate('staging')
    expect(await walkFiles(join(root, 'hooks'))).toHaveLength(3)

    activate('production', false)
    expect(await walkFiles(join(root, 'hooks'))).toHaveLength(3)
    expect(heldBackPaths()).toEqual([])
  })

  it('resolves globs against rootDir', async () => {
    activateExclusions({config: {environments: {production: {exclude: ['games.php']}}, rootDir: 'hooks'}, cwd: root, envName: 'production', honors: true})

    expect((await walkFiles(join(root, 'hooks'))).toSorted((a, b) => a.localeCompare(b))).toEqual(['feature/page.php', 'live.php'])
  })
})
