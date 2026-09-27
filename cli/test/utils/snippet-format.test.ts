import {describe, expect, it} from 'vitest'

import {
  buildMetaFile,
  buildSnippetFile,
  defaultLocationForType,
  normalizeSnippet,
  parseInsertMethod,
  parseLocation,
  parseType,
  stripPhpOpeningTag,
} from '../../src/utils/snippet-format.js'

describe('snippet-format', () => {
  describe('parseType', () => {
    it('accepts valid types case-insensitively', () => {
      expect(parseType('PHP')).toBe('php')
      expect(parseType('css')).toBe('css')
    })

    it('returns null for invalid or missing types', () => {
      expect(parseType('ruby')).toBeNull()
      expect(parseType(null)).toBeNull()
    })
  })

  describe('parseLocation', () => {
    it('accepts valid canonical locations', () => {
      expect(parseLocation('everywhere')).toBe('everywhere')
      expect(parseLocation('HEADER')).toBe('header')
    })

    it('returns null for an invalid location', () => {
      expect(parseLocation('site_wide_footer')).toBeNull()
    })
  })

  describe('parseInsertMethod', () => {
    it('accepts "auto" and "shortcode"', () => {
      expect(parseInsertMethod('auto')).toBe('auto')
      expect(parseInsertMethod('shortcode')).toBe('shortcode')
    })

    it('returns null for anything else', () => {
      expect(parseInsertMethod('manual')).toBeNull()
    })
  })

  describe('defaultLocationForType', () => {
    it('maps each type to its sensible default', () => {
      expect(defaultLocationForType('php')).toBe('everywhere')
      expect(defaultLocationForType('css')).toBe('header')
      expect(defaultLocationForType('html')).toBe('footer')
      expect(defaultLocationForType('js')).toBe('footer')
      expect(defaultLocationForType('text')).toBe('footer')
    })
  })

  describe('stripPhpOpeningTag', () => {
    it('strips a leading <?php tag case-insensitively', () => {
      expect(stripPhpOpeningTag('<?php echo 1;')).toBe('echo 1;')
      expect(stripPhpOpeningTag('<?PHP\n\necho 1;')).toBe('echo 1;')
    })

    it('leaves code without an opening tag unchanged', () => {
      expect(stripPhpOpeningTag('echo 1;')).toBe('echo 1;')
    })

    it('only strips a <?php tag at the very start, not one appearing mid-string', () => {
      expect(stripPhpOpeningTag('echo "<?php";')).toBe('echo "<?php";')
    })
  })

  describe('normalizeSnippet', () => {
    it('maps a well-formed remote payload as-is', () => {
      const result = normalizeSnippet({
        active: true,
        code: 'echo 1;',
        description: 'A snippet',
        id: 1,
        insertMethod: 'shortcode',
        location: 'footer',
        name: 'My snippet',
        priority: 5,
        shortcodeAttributes: ['color'],
        tags: ['php'],
        type: 'php',
      })

      expect(result).toEqual({
        active: true,
        code: 'echo 1;',
        description: 'A snippet',
        id: 1,
        insertMethod: 'shortcode',
        location: 'footer',
        name: 'My snippet',
        priority: 5,
        shortcodeAttributes: ['color'],
        tags: ['php'],
        type: 'php',
      })
    })

    it('falls back to sensible defaults for missing or malformed fields', () => {
      const result = normalizeSnippet({code: '', id: 2})

      expect(result.active).toBe(false)
      expect(result.description).toBe('')
      expect(result.name).toBe('')
      expect(result.insertMethod).toBe('auto')
      expect(result.type).toBe('php')
      expect(result.location).toBe('everywhere')
      expect(result.priority).toBe(10)
      expect(result.shortcodeAttributes).toEqual([])
      expect(result.tags).toEqual([])
    })

    it('derives the default location from the type when location is invalid', () => {
      const result = normalizeSnippet({code: '', id: 3, location: 'not-a-real-location', type: 'css'})

      expect(result.location).toBe('header')
    })
  })

  describe('exhaustive values and coercion', () => {
    it.each(['css', 'html', 'js', 'php', 'text'])('accepts the "%s" type', (type) => {
      expect(parseType(type)).toBe(type)
    })

    it.each(['admin', 'body', 'everywhere', 'footer', 'frontend', 'header', 'once'])(
      'accepts the "%s" location',
      (location) => {
        expect(parseLocation(location)).toBe(location)
      },
    )

    it('rejects an insert method in another case, unlike type and location', () => {
      expect(parseInsertMethod('AUTO')).toBeNull()
    })

    it('never turns an object into "[object Object]"', () => {
      expect(parseType({toString: () => 'php'})).toBeNull()
      expect(parseLocation({})).toBeNull()
      expect(normalizeSnippet({code: {nested: true}, id: 1, name: ['a']})).toMatchObject({code: '', name: ''})
    })

    it('stringifies numbers and booleans', () => {
      expect(normalizeSnippet({code: 42, description: false, id: 1, name: true})).toMatchObject({
        code: '42',
        description: 'false',
        name: 'true',
      })
    })

    it('reads a numeric priority, including 0 and a numeric string, and falls back to 10 otherwise', () => {
      expect(normalizeSnippet({id: 1, priority: 0}).priority).toBe(0)
      expect(normalizeSnippet({id: 1, priority: '20'}).priority).toBe(20)
      expect(normalizeSnippet({id: 1, priority: 'high'}).priority).toBe(10)
      expect(normalizeSnippet({id: 1, priority: Infinity}).priority).toBe(10)
    })

    it('keeps a string revision and drops anything else', () => {
      expect(normalizeSnippet({id: 1, revision: 'abc'}).revision).toBe('abc')
      expect(normalizeSnippet({id: 1, revision: 5}).revision).toBeUndefined()
    })

    it('stringifies shortcode attributes and ignores non-array tags and attributes', () => {
      expect(normalizeSnippet({id: 1, shortcodeAttributes: ['a', 2]}).shortcodeAttributes).toEqual(['a', '2'])
      expect(normalizeSnippet({id: 1, shortcodeAttributes: 'a', tags: 'x'})).toMatchObject({
        shortcodeAttributes: [],
        tags: [],
      })
    })

    it('reads a numeric string id and a truthy active flag', () => {
      expect(normalizeSnippet({active: 1, id: '12'})).toMatchObject({active: true, id: 12})
    })

    it('derives the location from a valid type when none is given', () => {
      expect(normalizeSnippet({id: 1, type: 'JS'})).toMatchObject({location: 'footer', type: 'js'})
    })
  })

  describe('buildSnippetFile and buildMetaFile edge cases', () => {
    const base = {
      active: true,
      code: 'echo 1;',
      description: '',
      id: 5,
      insertMethod: 'auto',
      location: 'everywhere',
      name: 'Demo',
      priority: 10,
      shortcodeAttributes: [],
      tags: [],
      type: 'php',
    } as const

    it('does not prepend <?php to PHP code whose opening tag follows leading whitespace', () => {
      expect(buildSnippetFile({...base, code: '\n  <?php echo 1;', shortcodeAttributes: [], tags: []})).toBe(
        '\n  <?php echo 1;',
      )
    })

    it('treats a short "<?" tag as already opened', () => {
      expect(buildSnippetFile({...base, code: '<?= 1 ?>', shortcodeAttributes: [], tags: []})).toBe('<?= 1 ?>')
    })

    it('writes only the required fields, in order, pretty-printed with a trailing newline, for a default snippet', () => {
      expect(buildMetaFile({...base, shortcodeAttributes: [], tags: []})).toBe(
        '{\n  "id": 5,\n  "name": "Demo",\n  "type": "php",\n  "active": true,\n  "location": "everywhere"\n}\n',
      )
    })

    it('writes a non-default priority of 0 and the shortcode attributes', () => {
      const meta = JSON.parse(
        buildMetaFile({...base, priority: 0, shortcodeAttributes: ['color'], tags: []}),
      ) as Record<string, unknown>

      expect(meta.priority).toBe(0)
      expect(meta.shortcodeAttributes).toEqual(['color'])
    })
  })
})
