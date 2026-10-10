import {describe, expect, it} from 'vitest'

import {checkCptFile, parseCptArgs} from '../../src/utils/cpt-format.js'

describe('cpt-format', () => {
  it('parses a JSON object of register_post_type() arguments', () => {
    expect(parseCptArgs('{"public": true}')).toEqual({public: true})
  })

  it.each(['[]', 'null', '"book"'])('refuses %s, not an arguments object', (raw) => {
    expect(() => parseCptArgs(raw)).toThrow('not a JSON object')
  })

  it('accepts a valid file', () => {
    expect(() => { checkCptFile('{"public": true}', 'cpt/book.json'); }).not.toThrow()
  })

  it.each(['cpt/Book.json', 'cpt/a_very_long_post_type_slug.json'])('refuses the file name %s as a slug', (filePath) => {
    expect(() => { checkCptFile('{}', filePath); }).toThrow('not a valid post type slug')
  })

  it('refuses an argument WordPress would run as code', () => {
    expect(() => { checkCptFile('{"register_meta_box_cb": "system"}', 'cpt/book.json'); }).toThrow('"register_meta_box_cb" runs PHP code')
  })
})
