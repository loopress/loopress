import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {findOrphanedFiles, findUnpushedFiles, numericPrefixKey} from '../../src/lib/find-orphaned-files.js'
import {readLastSeen, writeLastSeen} from '../../src/lib/last-seen.js'

describe('last seen', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-last-seen-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('reads undefined when nothing was recorded or the file is corrupted', async () => {
    await expect(readLastSeen(dir, 'snippet', 'staging')).resolves.toBeUndefined()

    mkdirSync(join(dir, '.loopress', 'last-seen', 'snippet'), {recursive: true})
    writeFileSync(join(dir, '.loopress', 'last-seen', 'snippet', 'staging.json'), '{nope')
    await expect(readLastSeen(dir, 'snippet', 'staging')).resolves.toBeUndefined()
  })

  it('round-trips keys and state per environment, merging keys', async () => {
    await writeLastSeen(dir, 'acf', 'staging', {keys: ['group_a'], state: new Map([['group/group_a', {title: 'A'}]])})
    await writeLastSeen(dir, 'acf', 'staging', {keys: ['group_b']})

    const seen = await readLastSeen(dir, 'acf', 'staging')
    expect([...(seen?.keys ?? [])]).toEqual(['group_a', 'group_b'])
    expect(seen?.state?.get('group/group_a')).toEqual({title: 'A'})
    await expect(readLastSeen(dir, 'acf', 'production')).resolves.toBeUndefined()
  })
})

describe('pull orphans with a last-seen set', () => {
  let dir: string
  const matcher = {extensions: ['.php'], key: numericPrefixKey}

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-last-seen-orphans-'))
    writeFileSync(join(dir, '3-gone.php'), '<?php')
    writeFileSync(join(dir, '9-never-pushed.php'), '<?php')
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('deletes only a file the site held before, and lists the others as not on the site yet', async () => {
    const seen = new Set(['3'])
    await expect(findOrphanedFiles(dir, new Set(), matcher, seen)).resolves.toEqual(['3-gone.php'])
    await expect(findUnpushedFiles(dir, new Set(), matcher, seen)).resolves.toEqual(['9-never-pushed.php'])
  })

  it('keeps every file with nothing recorded (a fresh clone)', async () => {
    await expect(findOrphanedFiles(dir, new Set(), matcher, new Set())).resolves.toEqual([])
    await expect(findUnpushedFiles(dir, new Set(), matcher, new Set())).resolves.toHaveLength(2)
  })
})
