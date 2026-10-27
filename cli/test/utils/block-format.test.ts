import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {materializeSnapshot} from '../../src/lib/rollback-materialize.js'
import {blockProblems, readLocalBlocks} from '../../src/utils/block-format.js'

const BLOCK_JSON = JSON.stringify({apiVersion: 3, name: 'loopress/hero', style: 'file:./style.css', viewScriptModule: ['file:./view.js']})

describe('blockProblems', () => {
  it('accepts a complete block', () => {
    expect(blockProblems('hero', {'block.json': BLOCK_JSON, 'render.php': '', 'style.css': '', 'view.js': ''})).toEqual([])
  })

  it('reports a missing file, a wrong name, a dangling file: reference and a stray file', () => {
    expect(blockProblems('other', {'block.json': BLOCK_JSON, 'notes.md': ''})).toEqual([
      'notes.md is not a block file, a block folder holds only block.json, render.php, style.css, view.js',
      'render.php is missing',
      'block.json "name" must be "loopress/other"',
      'block.json references file:./style.css, which is not in the folder',
      'block.json references file:./view.js, which is not in the folder',
    ])
  })

  it('refuses invalid JSON and an invalid folder name', () => {
    expect(blockProblems('hero', {'block.json': '{', 'render.php': ''})).toEqual(['block.json is not valid JSON'])
    expect(blockProblems('Hero', {})).toEqual(['the folder name must be lowercase letters, digits and hyphens, starting with a letter'])
  })
})

describe('readLocalBlocks and the rollback materializer', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-blocks-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('returns nothing for a missing directory', async () => {
    expect(await readLocalBlocks(join(dir, 'missing'))).toEqual({blocks: [], problems: []})
  })

  it('reads back exactly what a snapshot restore writes', async () => {
    const files = {'block.json': JSON.stringify({name: 'loopress/hero'}), 'render.php': '<p>hi</p>'}
    await materializeSnapshot('block', {hero: files}, dir)

    expect(await readLocalBlocks(dir)).toEqual({blocks: [{files, slug: 'hero'}], problems: []})
  })

  it('refuses to write a slug or file name that would escape the blocks directory', async () => {
    await expect(materializeSnapshot('block', {'..': {'render.php': ''}}, dir)).rejects.toThrow('invalid slug or file name')
    await expect(materializeSnapshot('block', {hero: {'../x.php': ''}}, dir)).rejects.toThrow('invalid slug or file name')
  })

  it('reports problems per folder, skipping dotfiles', async () => {
    mkdirSync(join(dir, 'hero'))
    writeFileSync(join(dir, 'hero', 'block.json'), JSON.stringify({name: 'loopress/hero'}))
    writeFileSync(join(dir, 'hero', '.DS_Store'), '')

    const {problems} = await readLocalBlocks(dir)
    expect(problems).toEqual([{file: join(dir, 'hero'), message: 'render.php is missing'}])
  })
})
