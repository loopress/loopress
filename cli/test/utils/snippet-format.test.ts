import {describe, expect, it} from 'vitest'

import {
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
})
