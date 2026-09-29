import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {parsePartFile, parseTemplateFile, readLocalTemplates} from '../../src/utils/template-format.js'

describe('parseTemplateFile', () => {
  it('reads title and postTypes from the header and strips it', () => {
    expect(parseTemplateFile('landing', '<!--\ntitle: Landing\npostTypes: page, post\n-->\n<!-- wp:post-content /-->')).toEqual({
      html: '<!-- wp:post-content /-->',
      postTypes: ['page', 'post'],
      slug: 'landing',
      title: 'Landing',
    })
  })

  it('keeps a leading block delimiter as markup and declares nothing', () => {
    const raw = '<!-- wp:template-part {"slug":"header"} /-->\n<!-- wp:post-content /-->'

    expect(parseTemplateFile('single', raw)).toEqual({html: raw, slug: 'single'})
  })

  it('refuses a template-part block pinned to a theme, and an unknown header key', () => {
    expect(() => parseTemplateFile('single', '<!-- wp:template-part {"slug":"header","theme":"twentytwentyfive"} /-->')).toThrow(
      'a template-part block has a "theme" attribute',
    )
    expect(() => parseTemplateFile('single', '<!-- description: x -->\n<p/>')).toThrow('unknown header key "description" (allowed: title, postTypes)')
  })
})

describe('parsePartFile', () => {
  it('derives area from the name and title from the slug', () => {
    expect(parsePartFile('header-large-title', '<p/>')).toEqual({area: 'header', html: '<p/>', slug: 'header-large-title', title: 'Header large title'})
    expect(parsePartFile('footer', '<p/>').area).toBe('footer')
    expect(parsePartFile('sidebar', '<p/>').area).toBe('uncategorized')
    expect(parsePartFile('headers', '<p/>').area).toBe('uncategorized')
  })

  it('lets the header override area and title', () => {
    expect(parsePartFile('promo', '<!--\ntitle: Promo bar\narea: header\n-->\n<p/>')).toEqual({area: 'header', html: '<p/>', slug: 'promo', title: 'Promo bar'})
  })
})

describe('readLocalTemplates', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-templates-'))
    mkdirSync(join(dir, 'templates'))
    mkdirSync(join(dir, 'parts'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('reads both directories and reports every problem at once', async () => {
    writeFileSync(join(dir, 'templates', 'single.html'), '<p/>')
    writeFileSync(join(dir, 'templates', 'bad.php'), '<?php')
    writeFileSync(join(dir, 'parts', 'header.html'), '<p/>')
    writeFileSync(join(dir, 'parts', 'Bad.html'), '<p/>')

    const result = await readLocalTemplates(join(dir, 'templates'), join(dir, 'parts'))

    expect(result.templates.map((template) => template.slug)).toEqual(['single'])
    expect(result.parts.map((part) => part.slug)).toEqual(['header'])
    expect(result.problems).toHaveLength(2)
  })

  it('treats missing directories as empty', async () => {
    expect(await readLocalTemplates(join(dir, 'nope'), join(dir, 'nope2'))).toEqual({parts: [], problems: [], templates: []})
  })
})
