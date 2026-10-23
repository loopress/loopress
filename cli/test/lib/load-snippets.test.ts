import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {loadSnippets} from '../../src/lib/load-snippets.js'

describe('loadSnippets', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-load-snippets-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  const sorted = <T extends {path: string}>(snippets: T[]): T[] => snippets.toSorted((a, b) => a.path.localeCompare(b.path))

  it('defaults every field from the file alone, by extension', async () => {
    for (const file of ['a.css', 'b.html', 'c.js', 'd.php', 'e.txt']) writeFileSync(join(dir, file), `code of ${file}`)

    const snippets = sorted(await loadSnippets(dir))

    expect(snippets.map((snippet) => [snippet.type, snippet.location])).toEqual([
      ['css', 'header'],
      ['html', 'footer'],
      ['js', 'footer'],
      ['php', 'everywhere'],
      ['text', 'footer'],
    ])
    expect(snippets[3]).toEqual({
      active: false,
      code: 'code of d.php',
      description: undefined,
      id: undefined,
      insertMethod: 'auto',
      location: 'everywhere',
      name: 'd',
      path: join(dir, 'd.php'),
      priority: 10,
      shortcodeAttributes: [],
      tags: [],
      type: 'php',
    })
  })

  it('reads the sidecar JSON over the defaults', async () => {
    writeFileSync(join(dir, 'banner.php'), '<?php echo 1;')
    writeFileSync(
      join(dir, 'banner.json'),
      JSON.stringify({
        active: 1,
        description: '',
        id: 7,
        insertMethod: 'shortcode',
        location: 'FRONTEND',
        name: 'Banner',
        priority: 20,
        shortcodeAttributes: ['size', 3],
        tags: ['promo', 2],
        type: 'html',
      }),
    )

    expect(await loadSnippets(dir)).toEqual([
      {
        active: true,
        code: '<?php echo 1;',
        description: '',
        id: 7,
        insertMethod: 'shortcode',
        location: 'frontend',
        name: 'Banner',
        path: join(dir, 'banner.php'),
        priority: 20,
        shortcodeAttributes: ['size', '3'],
        tags: ['promo', '2'],
        type: 'html',
      },
    ])
  })

  it('falls back to the defaults for empty or invalid sidecar values', async () => {
    writeFileSync(join(dir, 'style.css'), 'a{}')
    writeFileSync(
      join(dir, 'style.json'),
      JSON.stringify({insertMethod: 'inline', location: 'sidebar', name: '', shortcodeAttributes: 'size', tags: 'promo', type: 'sass'}),
    )

    const [snippet] = await loadSnippets(dir)

    expect(snippet).toMatchObject({
      active: false,
      insertMethod: 'auto',
      location: 'header',
      name: 'style',
      priority: 10,
      shortcodeAttributes: [],
      tags: [],
      type: 'css',
    })
  })

  it('skips only the snippet with a broken sidecar or an unreadable file, and ignores other files', async () => {
    writeFileSync(join(dir, 'good.php'), '<?php')
    writeFileSync(join(dir, 'broken.php'), '<?php')
    writeFileSync(join(dir, 'broken.json'), '{nope')
    mkdirSync(join(dir, 'folder.js'))
    writeFileSync(join(dir, 'notes.md'), '# notes')
    const skipped: string[] = []

    const snippets = await loadSnippets(dir, (message) => {
      skipped.push(message)
    })

    expect(snippets.map((snippet) => snippet.name)).toEqual(['good'])
    expect(skipped.toSorted((a, b) => a.localeCompare(b))).toEqual([
      expect.stringMatching(new RegExp(`^Skipping "${join(dir, 'broken.json')}": .*JSON`)),
      expect.stringMatching(new RegExp(`^Skipping "${join(dir, 'folder.js')}": .*EISDIR`)),
    ])
  })

  it('skips silently without a callback', async () => {
    writeFileSync(join(dir, 'broken.php'), '<?php')
    writeFileSync(join(dir, 'broken.json'), '{nope')

    expect(await loadSnippets(dir)).toEqual([])
  })

  it('explains a missing directory', async () => {
    await expect(loadSnippets(join(dir, 'missing'))).rejects.toThrow(/^Error loading snippets: ENOENT/)
  })
})
