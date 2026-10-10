import {describe, expect, it} from 'vitest'

import {CPT_SPEC, declaredFileChecker, parseDeclaredArgs, TAXONOMY_SPEC} from '../../src/utils/declared-type-format.js'

const checkCptFile = declaredFileChecker(CPT_SPEC)
const checkTaxonomyFile = declaredFileChecker(TAXONOMY_SPEC)

describe('declared-type-format', () => {
  it('parses a JSON object of register_post_type() arguments', () => {
    expect(parseDeclaredArgs('{"public": true}')).toEqual({public: true})
  })

  it.each(['[]', 'null', '"book"'])('refuses %s, not an arguments object', (raw) => {
    expect(() => parseDeclaredArgs(raw)).toThrow('not a JSON object')
  })

  it('accepts a valid file', () => {
    expect(() => { checkCptFile('{"public": true}', 'cpt/book.json'); }).not.toThrow()
  })

  it.each(['cpt/Book.json', 'cpt/a_very_long_post_type_slug.json'])('refuses the file name %s as a slug', (filePath) => {
    expect(() => { checkCptFile('{}', filePath); }).toThrow('not a valid post type slug')
  })

  it.each([
    ['{"capabilities": "edit_posts"}', '"capabilities" must be a JSON object or array'],
    ['{"supports": true}', '"supports" must be a JSON object or array (or false)'],
    ['{"labels": null}', '"labels" must be a JSON object or array'],
  ])('refuses %s, not an array where WordPress needs one', (raw, message) => {
    expect(() => {
      checkCptFile(raw, 'cpt/book.json')
    }).toThrow(message)
  })

  it('accepts the non-array values WordPress allows', () => {
    expect(() => {
      checkCptFile('{"rewrite": false, "supports": false}', 'cpt/book.json')
    }).not.toThrow()
  })

  it('refuses an argument WordPress would run as code', () => {
    expect(() => { checkCptFile('{"register_meta_box_cb": "system"}', 'cpt/book.json'); }).toThrow('"register_meta_box_cb" runs PHP code')
  })

  describe('taxonomies', () => {
    it('accepts a 32-character slug and an object_type list', () => {
      expect(() => {
        checkTaxonomyFile('{"object_type": ["book"]}', `taxonomies/${'a'.repeat(32)}.json`)
      }).not.toThrow()
    })

    it('refuses a 33-character slug', () => {
      expect(() => {
        checkTaxonomyFile('{}', `taxonomies/${'a'.repeat(33)}.json`)
      }).toThrow('1 to 32 lowercase letters')
    })

    it('refuses object_type given as a single string', () => {
      expect(() => {
        checkTaxonomyFile('{"object_type": "book"}', 'taxonomies/genre.json')
      }).toThrow('"object_type" must be a JSON object or array')
    })

    it('refuses a callback argument', () => {
      expect(() => {
        checkTaxonomyFile('{"meta_box_cb": "system"}', 'taxonomies/genre.json')
      }).toThrow('"meta_box_cb" runs PHP code')
    })
  })
})
