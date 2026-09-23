import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {PAGE_SLUG_PATTERN, parsePageFile, readLocalPages, titleFromSlug} from '../../src/utils/page-format.js'

describe('PAGE_SLUG_PATTERN', () => {
  it('only accepts slugs sanitize_title() keeps as is', () => {
    for (const slug of ['about', 'legal-notice', 'page-2']) expect(PAGE_SLUG_PATTERN.test(slug)).toBe(true)
    for (const slug of ['-about', 'about-', 'a--b', 'About', 'a_b', '']) expect(PAGE_SLUG_PATTERN.test(slug)).toBe(false)
  })
})

describe('titleFromSlug', () => {
  it('turns a kebab-case slug into a sentence-case title', () => {
    expect(titleFromSlug('legal-notice')).toBe('Legal notice')
    expect(titleFromSlug('about')).toBe('About')
  })
})

describe('parsePageFile', () => {
  it('reads title and status from the header comment and strips it from the html', () => {
    const raw = '<!--\ntitle: Mentions légales\nstatus: publish\n-->\n<section class="legal">x</section>\n'

    expect(parsePageFile('legal', raw)).toEqual({
      html: '<section class="legal">x</section>\n',
      slug: 'legal',
      status: 'publish',
      title: 'Mentions légales',
    })
  })

  it('defaults to draft and a slug-derived title without a header, keeping the html verbatim', () => {
    expect(parsePageFile('legal-notice', '<p>x</p>')).toEqual({html: '<p>x</p>', slug: 'legal-notice', status: 'draft', title: 'Legal notice'})
  })

  it('tolerates leading whitespace before the header and values containing a colon', () => {
    expect(parsePageFile('a', '  \n<!-- title: Tarifs: 2026 -->\n<p/>').title).toBe('Tarifs: 2026')
  })

  it('only reads a header at the very start of the file', () => {
    const page = parsePageFile('a', '<p>x</p>\n<!-- status: publish -->')
    expect(page.status).toBe('draft')
    expect(page.html).toBe('<p>x</p>\n<!-- status: publish -->')
  })

  it('rejects an unknown key, an invalid status, and a line that is not key: value', () => {
    expect(() => parsePageFile('a', '<!-- titel: x -->')).toThrow('unknown header key "titel"')
    expect(() => parsePageFile('a', '<!-- status: private -->')).toThrow('status "private" is not one of draft, publish')
    expect(() => parsePageFile('a', '<!-- Hero section -->')).toThrow('is not a "key: value" pair')
  })
})

describe('readLocalPages', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-page-format-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('reads every .html page sorted by slug and ignores dotfiles', async () => {
    writeFileSync(join(dir, 'contact.html'), '<p>c</p>')
    writeFileSync(join(dir, 'about.html'), '<p>a</p>')
    writeFileSync(join(dir, '.DS_Store'), '')

    const {pages, problems} = await readLocalPages(dir)

    expect(problems).toEqual([])
    expect(pages.map((page) => page.slug)).toEqual(['about', 'contact'])
  })

  it('reports every non-.html file, subdirectory, bad file name and bad header at once', async () => {
    writeFileSync(join(dir, 'hack.php'), '<?php')
    writeFileSync(join(dir, 'About.html'), '')
    writeFileSync(join(dir, 'bad.html'), '<!-- status: nope -->')
    mkdirSync(join(dir, 'services'))
    writeFileSync(join(dir, 'ok.html'), '')

    const {pages, problems} = await readLocalPages(dir)

    expect(pages.map((page) => page.slug)).toEqual(['ok'])
    expect(problems.map((problem) => problem.file)).toEqual([
      join(dir, 'About.html'),
      join(dir, 'bad.html'),
      join(dir, 'hack.php'),
      join(dir, 'services'),
    ])
  })

  it('treats a missing directory as no pages', async () => {
    expect(await readLocalPages(join(dir, 'nope'))).toEqual({pages: [], problems: []})
  })
})
