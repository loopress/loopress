import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {activateExclusions, heldBackPaths} from '../../src/lib/exclude.js'
import {getResourceStateProvider} from '../../src/lib/resource-state.js'
import {materializeSnapshot} from '../../src/lib/rollback-materialize.js'
import {type WpClient} from '../../src/lib/wp-client.js'
import {blockFilesToPush, blockProblems, readLocalBlocks} from '../../src/utils/block-format.js'

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

describe('excluded files inside a block folder', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lps-block-exclude-'))
    mkdirSync(join(root, 'blocks', 'hero'), {recursive: true})
    writeFileSync(join(root, 'blocks', 'hero', 'block.json'), BLOCK_JSON)
    writeFileSync(join(root, 'blocks', 'hero', 'render.php'), 'local render')
    writeFileSync(join(root, 'blocks', 'hero', 'style.css'), 'local style')
    writeFileSync(join(root, 'blocks', 'hero', 'view.js'), 'local view')
    activateExclusions({config: {environments: {production: {exclude: ['blocks/hero/view.js']}}}, cwd: root, envName: 'production', honors: true})
  })

  afterEach(() => {
    activateExclusions({config: {}, cwd: root, envName: 'production', honors: false})
    rmSync(root, {force: true, recursive: true})
  })

  it('checks the whole folder, drops the excluded file and records it as held back', async () => {
    const {blocks, problems} = await readLocalBlocks(join(root, 'blocks'))
    expect(problems).toEqual([])
    expect(blocks).toEqual([{files: {'block.json': BLOCK_JSON, 'render.php': 'local render', 'style.css': 'local style'}, slug: 'hero'}])
    expect(heldBackPaths()).toEqual(['blocks/hero/view.js'])
  })

  it("sends the site's copy of the excluded file, or leaves it out when the site has none", async () => {
    const dir = join(root, 'blocks')
    const block = {files: {'render.php': 'local render', 'view.js': 'local view'}, slug: 'hero'}
    expect(blockFilesToPush(dir, block, {'view.js': 'site view'})).toEqual({'render.php': 'local render', 'view.js': 'site view'})
    expect(blockFilesToPush(dir, block, undefined)).toEqual({'render.php': 'local render'})
  })

  it("compares the block with the site's copy of the excluded file, as the push sends it", async () => {
    const wp = {get: async () => [{files: {'view.js': 'site view'}, slug: 'hero'}]} as unknown as WpClient
    const state = await getResourceStateProvider('block').local(join(root, 'blocks'), () => {}, wp)
    expect(state.get('hero')).toEqual({'block.json': BLOCK_JSON, 'render.php': 'local render', 'style.css': 'local style', 'view.js': 'site view'})
  })
})
