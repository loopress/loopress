import {describe, expect, it} from 'vitest'

import {
  CPT_SPEC,
  declaredFileChecker,
  formatDeclaredFile,
  formatPatternFile,
  META_SPEC,
  parseDeclaredArgs,
  parsePatternFile,
  PATTERN_SPEC,
  ROLE_SPEC,
  TAXONOMY_SPEC,
} from '../../src/utils/declared-type-format.js'

// Built inside each test, so mutation testing ties the checker's code to the tests using it.
const checkCptFile = (raw: string, filePath: string): void => { declaredFileChecker(CPT_SPEC)(raw, filePath); }
const checkTaxonomyFile = (raw: string, filePath: string): void => { declaredFileChecker(TAXONOMY_SPEC)(raw, filePath); }
const checkMetaFile = (raw: string, filePath: string): void => { declaredFileChecker(META_SPEC)(raw, filePath); }

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
    ['{"rewrite": "books"}', '"rewrite" must be a JSON object or array (or true, false)'],
  ])('refuses %s, not an array where WordPress needs one', (raw, message) => {
    expect(() => {
      checkCptFile(raw, 'cpt/book.json')
    }).toThrow(message)
  })

  it('names no alternative when only an object or array is allowed', () => {
    expect(() => {
      checkCptFile('{"labels": "Books"}', 'cpt/book.json')
    }).toThrow(/^"labels" must be a JSON object or array$/)
  })

  it('formats JSON arguments with a trailing newline', () => {
    expect(formatDeclaredFile(CPT_SPEC, {public: true})).toBe('{\n  "public": true\n}\n')
  })

  it('formats a pattern as its HTML file', () => {
    expect(formatDeclaredFile(PATTERN_SPEC, {content: '<p>Hi</p>', title: 'Hero'})).toBe('<!--\ntitle: Hero\n-->\n<p>Hi</p>')
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

    it('refuses default_term, which would create a term', () => {
      expect(() => {
        checkTaxonomyFile('{"default_term": {"name": "Fiction"}}', 'taxonomies/genre.json')
      }).toThrow('"default_term" creates a term')
    })

    it('refuses a callback argument', () => {
      expect(() => {
        checkTaxonomyFile('{"meta_box_cb": "system"}', 'taxonomies/genre.json')
      }).toThrow('"meta_box_cb" runs PHP code')
    })
  })

  describe('post meta', () => {
    it('accepts a built-in post type, a protected key, and an array with a REST schema', () => {
      const file = {
        _note: {type: 'string'},
        authors: {show_in_rest: {schema: {items: {type: 'string'}}}, single: true, type: 'array'},
        pages: {default: 0, type: 'integer'},
      }
      expect(() => {
        checkMetaFile(JSON.stringify(file), 'meta/post.json')
      }).not.toThrow()
    })

    it.each([
      [{isbn: 'string'}, '"isbn" must be a JSON object'],
      [{isbn: {single: true}}, '"type" must be one of'],
      [{isbn: {sanitize_callback: 'system', type: 'string'}}, '"sanitize_callback" runs PHP code'],
      [{isbn: {auth_callback: '__return_true', type: 'string'}}, '"auth_callback" runs PHP code'],
      [{isbn: {single: 'yes', type: 'string'}}, '"single" must be true or false'],
      [{authors: {show_in_rest: true, type: 'array'}}, 'needs "show_in_rest": { "schema"'],
      [{isbn: {show_in_rest: {prepare_callback: 'system'}, type: 'string'}}, '"show_in_rest.prepare_callback" runs PHP code'],
      [{pages: {default: '0', type: 'integer'}}, '"default" must be a integer'],
      [{'my key': {type: 'string'}}, 'not a valid meta key'],
      [{isbn: {type: 'text'}}, '"isbn": "type" must be one of array, boolean, integer, number, object, string'],
      [{isbn: {type: 5}}, '"type" must be one of'],
      [{isbn: {show_in_rest: 'yes', type: 'string'}}, '"isbn": "show_in_rest" must be true, false or an object'],
      [{isbn: {show_in_rest: ['schema'], type: 'string'}}, '"show_in_rest" must be true, false or an object'],
      [{isbn: {show_in_rest: null, type: 'string'}}, '"isbn": "show_in_rest" must be true, false or an object'],
      [{data: {show_in_rest: true, type: 'object'}}, '"data": a object exposed in REST needs "show_in_rest": { "schema"'],
      [{data: {show_in_rest: {}, type: 'object'}}, 'needs "show_in_rest": { "schema"'],
      [{data: {show_in_rest: {schema: true}, type: 'array'}}, 'needs "show_in_rest": { "schema"'],
      [{flag: {default: 'yes', type: 'boolean'}}, '"default" must be a boolean'],
      [{rate: {default: '1.5', type: 'number'}}, '"default" must be a number'],
      [{note: {default: 1, type: 'string'}}, '"default" must be a string'],
      [{list: {default: {}, type: 'array'}}, '"default" must be a array'],
      [{data: {default: [], type: 'object'}}, '"default" must be a object'],
    ])('refuses %j', (file, message) => {
      expect(() => {
        checkMetaFile(JSON.stringify(file), 'meta/book.json')
      }).toThrow(message)
    })

    it.each([
      [{flag: {default: false, type: 'boolean'}}],
      [{rate: {default: 1.5, type: 'number'}}],
      [{note: {default: 'n/a', type: 'string'}}],
      [{data: {default: {}, type: 'object'}}],
      [{data: {type: 'object'}}],
      [{data: {show_in_rest: false, type: 'array'}}],
      [{data: {show_in_rest: {schema: {type: 'object'}}, type: 'object'}}],
      [{note: {show_in_rest: true, type: 'string'}}],
    ])('accepts %j', (file) => {
      expect(() => {
        checkMetaFile(JSON.stringify(file), 'meta/book.json')
      }).not.toThrow()
    })
  })

  describe('roles', () => {
    const checkRoleFile = (raw: string, filePath: string): void => { declaredFileChecker(ROLE_SPEC)(raw, filePath); }

    it('accepts a role without capabilities', () => {
      expect(() => {
        checkRoleFile('{"name": "Client"}', 'roles/client.json')
      }).not.toThrow()
    })

    it('accepts a name and boolean capabilities', () => {
      expect(() => {
        checkRoleFile('{"name": "Client", "capabilities": {"read": true, "edit_posts": false}}', 'roles/client.json')
      }).not.toThrow()
    })

    it.each([
      ['{"capabilities": {}}', '"name" must be a non-empty string'],
      ['{"name": "  "}', '"name" must be a non-empty string'],
      ['{"name": 5}', '"name" must be a non-empty string'],
      ['{"name": "Client", "capabilities": {"read": true, "edit_posts": "yes"}}', '"capabilities" must map each capability name to true or false'],
      ['{"name": "Client", "capabilities": {"read": 1}}', '"capabilities" must map each capability name to true or false'],
      ['{"name": "Client", "capabilities": ["read"]}', '"capabilities" must map each capability name to true or false'],
    ])('refuses %s', (raw, message) => {
      expect(() => {
        checkRoleFile(raw, 'roles/client.json')
      }).toThrow(message)
    })
  })

  describe('patterns', () => {
    const file = '<!--\ntitle: Hero\ncategories: banner, call-to-action\nviewport-width: 1200\ninserter: false\n-->\n<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->\n'

    it('reads the header into register_block_pattern() properties and the body into content', () => {
      expect(parsePatternFile('hero', file)).toEqual({
        categories: ['banner', 'call-to-action'],
        content: '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->\n',
        inserter: false,
        title: 'Hero',
        viewportWidth: 1200,
      })
    })

    it('round-trips through formatPatternFile()', () => {
      expect(parsePatternFile('hero', formatPatternFile(parsePatternFile('hero', file)))).toEqual(parsePatternFile('hero', file))
    })

    it('defaults the title to the slug', () => {
      expect(parsePatternFile('call-to-action', '<p>Go</p>')).toEqual({content: '<p>Go</p>', title: 'Call to action'})
    })

    it('reads list items without the empty ones, and inserter: true', () => {
      expect(parsePatternFile('hero', '<!--\nblock-types: core/post-content, ,core/group,\ninserter: true\n-->\n')).toEqual({
        blockTypes: ['core/post-content', 'core/group'],
        content: '',
        inserter: true,
        title: 'Hero',
      })
    })

    it('formats a pattern without content as its header alone', () => {
      expect(formatPatternFile({keywords: ['a', 'b'], title: 'Hero'})).toBe('<!--\nkeywords: a, b\ntitle: Hero\n-->\n')
    })

    it('accepts a valid pattern file', () => {
      expect(() => {
        declaredFileChecker(PATTERN_SPEC)(file, 'patterns/hero.html')
      }).not.toThrow()
    })

    it.each([
      ['<!--\nviewport-width: wide\n-->\n', '"viewport-width" must be a whole number'],
      ['<!--\nviewport-width: 1200px\n-->\n', '"viewport-width" must be a whole number'],
      ['<!--\nviewport-width: w1200\n-->\n', '"viewport-width" must be a whole number'],
      ['<!--\ninserter: \n-->\n', '"inserter" must be "true" or "false"'],
      ['<!--\ntitle: \n-->\n', '"title" must be a non-empty string'],
      ['<!--\ntitle:    \n-->\n', '"title" must be a non-empty string'],
      ['<!--\ninserter: no\n-->\n', '"inserter" must be "true" or "false"'],
      ['<!--\nsource: theme\n-->\n', 'unknown header key "source"'],
    ])('refuses %j', (raw, message) => {
      expect(() => {
        declaredFileChecker(PATTERN_SPEC)(raw, 'patterns/hero.html')
      }).toThrow(message)
    })
  })
})
