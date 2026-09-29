import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {formatPageProblems, frontPageNote, PAGE_SLUG_PATTERN, parsePageFile, type PushedPage, readLocalPages, titleFromSlug} from '../../src/utils/page-format.js'

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
      fullWidth: false,
      hideTitle: false,
      html: '<section class="legal">x</section>\n',
      slug: 'legal',
      status: 'publish',
      template: '',
      title: 'Mentions légales',
    })
  })

  it('defaults to draft and a slug-derived title without a header, keeping the html verbatim', () => {
    expect(parsePageFile('legal-notice', '<p>x</p>')).toEqual({
      fullWidth: false,
      hideTitle: false,
      html: '<p>x</p>',
      slug: 'legal-notice',
      status: 'draft',
      template: '',
      title: 'Legal notice',
    })
  })

  it('reads full-width and hide-title booleans, and the template slug, from the header', () => {
    const raw = '<!--\nfull-width: true\nhide-title: true\ntemplate: page-no-title\n-->\n<p>x</p>'
    const page = parsePageFile('a', raw)
    expect(page.fullWidth).toBe(true)
    expect(page.hideTitle).toBe(true)
    expect(page.template).toBe('page-no-title')
  })

  it('rejects a full-width/hide-title value that is not "true" or "false"', () => {
    expect(() => parsePageFile('a', '<!-- full-width: yes -->\n<p>x</p>')).toThrow('"full-width" must be "true" or "false"')
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

describe('page-format exact messages and edge cases', () => {
  it('capitalizes only the first letter and drops empty segments', () => {
    expect(titleFromSlug('faq-2026')).toBe('Faq 2026')
    expect(titleFromSlug('')).toBe('')
  })

  it('joins page problems one per indented line', () => {
    expect(formatPageProblems([{file: 'a.php', message: 'x'}, {file: 'b', message: 'y'}])).toBe('a.php: x\n  b: y')
  })

  it.each([
    [undefined, ''],
    ['set', ' (now the site front page)'],
    ['unset', ' (no longer the front page, the site shows its latest posts)'],
  ] as const)('notes a %s front page change as "%s"', (frontPage, note) => {
    expect(frontPageNote({frontPage} as PushedPage)).toBe(note)
  })

  it('reads explicit false booleans', () => {
    expect(parsePageFile('a', '<!--\nfull-width: false\nhide-title: false\n-->\n')).toMatchObject({fullWidth: false, hideTitle: false})
  })

  it('names the key and the value in a bad boolean error', () => {
    expect(() => parsePageFile('a', '<!-- hide-title: 1 -->')).toThrow(/^"hide-title" must be "true" or "false", got "1"$/)
  })

  it('uses the slug-derived title when the header title is empty', () => {
    expect(parsePageFile('legal-notice', '<!--\ntitle:\n-->\n').title).toBe('Legal notice')
  })

  it('strips a CRLF header and the line break that closes it, skipping blank header lines', () => {
    expect(parsePageFile('a', '<!--\r\n\r\ntitle: T\r\nstatus: publish\r\n-->\r\n<p/>')).toMatchObject({html: '<p/>', status: 'publish', title: 'T'})
  })

  it('keeps html starting right after a header that has no trailing line break', () => {
    expect(parsePageFile('a', '<!-- title: T --><p/>').html).toBe('<p/>')
  })

  it('stops the header at the first closing marker', () => {
    expect(parsePageFile('a', '<!-- title: T -->\n<!-- note -->').html).toBe('<!-- note -->')
  })

  it('lists every allowed key and quotes the offending line in header errors', () => {
    expect(() => parsePageFile('a', '<!-- titel: x -->')).toThrow(/^unknown header key "titel" \(allowed: title, status, full-width, hide-title, template\)$/)
    expect(() => parsePageFile('a', '<!--\n  Hero section  \n-->')).toThrow(/^header line "Hero section" is not a "key: value" pair$/)
  })

  it('reads every allowed header key', () => {
    expect(
      parsePageFile('a', '<!--\ntitle: T\nstatus: draft\nfull-width: true\nhide-title: true\ntemplate: wide\n-->\n'),
    ).toEqual({fullWidth: true, hideTitle: true, html: '', slug: 'a', status: 'draft', template: 'wide', title: 'T'})
  })
})

describe('readLocalPages exact problems', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-page-format-problems-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('explains each problem', async () => {
    writeFileSync(join(dir, 'hack.php'), '')
    writeFileSync(join(dir, 'a--b.html'), '')
    mkdirSync(join(dir, 'services'))

    const {problems} = await readLocalPages(dir)

    expect(problems).toEqual([
      {
        file: join(dir, 'a--b.html'),
        message: 'the file name must be lowercase letters and digits separated by single hyphens (e.g. "legal-notice.html")',
      },
      {file: join(dir, 'hack.php'), message: `only .html files are allowed in ${dir}`},
      {file: join(dir, 'services'), message: `subdirectories are not supported, keep every file at the top of ${dir}`},
    ])
  })

  it('ignores a dot-directory too', async () => {
    mkdirSync(join(dir, '.git'))

    expect(await readLocalPages(dir)).toEqual({pages: [], problems: []})
  })

  it('rethrows a failure other than a missing directory', async () => {
    writeFileSync(join(dir, 'file'), '')

    await expect(readLocalPages(join(dir, 'file'))).rejects.toThrow(/ENOTDIR/)
  })
})
