import {Buffer} from 'node:buffer'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {bundleThemeCss} from '../../src/utils/theme-css.js'

describe('bundleThemeCss', () => {
  let root: string
  let cssDir: string
  let blocksDir: string

  const write = (path: string, content: string | Uint8Array): void => {
    mkdirSync(dirname(join(root, path)), {recursive: true})
    writeFileSync(join(root, path), content)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lps-theme-css-'))
    cssDir = join(root, 'theme/css')
    blocksDir = join(root, 'theme/blocks')
  })

  afterEach(() => {
    rmSync(root, {force: true, recursive: true})
  })

  it('returns nothing when neither folder exists', async () => {
    expect(await bundleThemeCss(cssDir, blocksDir)).toEqual({css: {assets: [], blocks: [], style: ''}, problems: []})
  })

  it('bundles style.css with its imports in order, and each block file on its own', async () => {
    write('theme/css/style.css', '@import "./10-layout.css";\n@import "./20-c-card.css";\n')
    write('theme/css/10-layout.css', '.l-wrap { max-width: 60rem; }\n')
    write('theme/css/20-c-card.css', '.c-card { padding: 1rem; }\n')
    write('theme/blocks/core/button.css', '.wp-block-button.is-style-outline { border-width: 2px; }\n')

    const {css, problems} = await bundleThemeCss(cssDir, blocksDir)

    expect(problems).toEqual([])
    expect(css.style).toMatch(/\.l-wrap\{max-width:60rem\}\s*\.c-card\{padding:1rem\}/)
    expect(css.style).not.toContain('@import')
    expect(css.blocks).toEqual([{css: expect.stringContaining('.wp-block-button.is-style-outline{border-width:2px}'), name: 'core/button'}])
  })

  it('copies a relative url() to assets/ and rewrites it from each output', async () => {
    write('theme/fonts/inter.woff2', Buffer.from([0, 1, 2]))
    write('theme/css/style.css', '@font-face { font-family: Inter; src: url("../fonts/inter.woff2"); }\n')
    write('theme/blocks/core/quote.css', '.wp-block-quote { font-family: Inter; background: url("../../fonts/inter.woff2"); }\n')

    const {css, problems} = await bundleThemeCss(cssDir, blocksDir)

    expect(problems).toEqual([])
    expect(css.assets).toEqual([{content: 'AAEC', path: expect.stringMatching(/^assets\/inter-\w+\.woff2$/)}])
    const asset = css.assets[0].path
    expect(css.style).toContain(`url("./${asset}")`)
    expect(css.blocks[0].css).toContain(`url("../../${asset}")`)
  })

  it('leaves absolute URLs alone', async () => {
    write('theme/css/style.css', '.hero { background: url("https://cdn.example.com/hero.jpg"); }\n')

    const {css} = await bundleThemeCss(cssDir, blocksDir)

    expect(css.style).toContain('https://cdn.example.com/hero.jpg')
    expect(css.assets).toEqual([])
  })

  it('reports a misplaced block file, CSS without the style.css entry, and a syntax error', async () => {
    write('theme/blocks/button.css', '')
    write('theme/blocks/core/Button.css', '')
    write('theme/css/main.css', '')

    const {problems} = await bundleThemeCss(cssDir, blocksDir)

    expect(problems.map((problem) => problem.file)).toEqual([cssDir, join(blocksDir, 'button.css'), join(blocksDir, 'core/Button.css')])

    rmSync(blocksDir, {recursive: true})
    write('theme/css/style.css', '@import "./missing.css";\n')
    const broken = await bundleThemeCss(cssDir, blocksDir)

    expect(broken.problems).toEqual([{file: expect.stringContaining('style.css:1'), message: expect.stringContaining('missing.css')}])
  })

  it('bundles block files alone, sorted by name, skipping hidden files', async () => {
    write('theme/blocks/core/quote.css', '.q { color: red; }\n')
    write('theme/blocks/acme/card.css', '.c { color: blue; }\n')
    write('theme/blocks/core/.DS_Store', '')
    write('theme/css/notes.md', '# not CSS\n')

    const {css, problems} = await bundleThemeCss(cssDir, blocksDir)

    expect(problems).toEqual([])
    expect(css.style).toBe('')
    expect(css.assets).toEqual([])
    expect(css.blocks.map((block) => block.name)).toEqual(['acme/card', 'core/quote'])
    expect(css.blocks[1].css).toContain('.q{color:red}')
  })

  it('explains where a block file belongs', async () => {
    write('theme/blocks/core/button.scss', '')
    write('theme/blocks/core/button/inner.css', '')
    write('theme/blocks/Core/button.css', '')
    write('theme/blocks/core/9button.css', '')

    const {css, problems} = await bundleThemeCss(cssDir, blocksDir)

    expect(css).toEqual({assets: [], blocks: [], style: ''})
    expect(problems.map((problem) => problem.file).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [
        join(blocksDir, 'Core/button.css'),
        join(blocksDir, 'core/9button.css'),
        join(blocksDir, 'core/button.scss'),
        join(blocksDir, 'core/button/inner.css'),
      ].toSorted((a, b) => a.localeCompare(b)),
    )
    expect(problems[0].message).toBe(`must be <namespace>/<block>.css, named after a block (e.g. ${join(blocksDir, 'core', 'button.css')})`)
  })

  it('explains that CSS files need the style.css entry', async () => {
    write('theme/css/main.css', '.a { color: red; }\n')

    expect((await bundleThemeCss(cssDir, blocksDir)).problems).toEqual([
      {file: cssDir, message: 'has CSS files but no style.css, the entry that @imports them: nothing in it would be loaded'},
    ])
  })

  it('throws when a folder cannot be read', async () => {
    write('theme/blocks', 'not a folder')

    await expect(bundleThemeCss(cssDir, blocksDir)).rejects.toThrow()
  })
})
