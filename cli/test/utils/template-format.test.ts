import {describe, expect, it} from 'vitest'

import {parseTemplateFile} from '../../src/utils/template-format.js'

describe('parseTemplateFile', () => {
  it('reads the title from the header and strips it from the markup', () => {
    expect(parseTemplateFile('landing', '<!--\ntitle: Landing page\n-->\n<!-- wp:post-content /-->\n')).toEqual({
      html: '<!-- wp:post-content /-->\n',
      slug: 'landing',
      title: 'Landing page',
    })
  })

  it('keeps a leading block delimiter as markup and derives the title from the slug', () => {
    const raw = '<!-- wp:template-part {"slug":"header"} /-->\n<!-- wp:post-content /-->'

    expect(parseTemplateFile('landing-page', raw)).toEqual({html: raw, slug: 'landing-page', title: 'Landing page'})
  })

  it('still refuses an unknown header key', () => {
    expect(() => parseTemplateFile('landing', '<!-- status: publish -->\n<p/>')).toThrow('unknown header key "status" (allowed: title)')
  })
})
