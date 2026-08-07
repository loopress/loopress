import {describe, expect, it} from 'vitest'

import {getPageContent, getPageId, getPageTitle, pageFileBase, pickPageMeta} from '../../src/utils/page-format.js'

describe('page-format', () => {
  describe('getPageId', () => {
    it('reads a positive integer id', () => {
      expect(getPageId({id: 12})).toBe(12)
    })

    it('returns null when there is no id', () => {
      expect(getPageId({})).toBeNull()
    })

    it('returns null for a zero or negative id', () => {
      expect(getPageId({id: 0})).toBeNull()
      expect(getPageId({id: -3})).toBeNull()
    })
  })

  describe('getPageTitle', () => {
    it('reads a plain string title (hand-created file)', () => {
      expect(getPageTitle({title: 'Contact'})).toBe('Contact')
    })

    it('reads title.raw from a `context=edit` REST response', () => {
      expect(getPageTitle({title: {raw: 'Contact', rendered: 'Contact'}})).toBe('Contact')
    })

    it('falls back to title.rendered when raw is missing', () => {
      expect(getPageTitle({title: {rendered: 'Contact'}})).toBe('Contact')
    })

    it('falls back to "(untitled)" when there is no usable title', () => {
      expect(getPageTitle({})).toBe('(untitled)')
      expect(getPageTitle({title: ''})).toBe('(untitled)')
      expect(getPageTitle({title: {raw: '', rendered: ''}})).toBe('(untitled)')
    })
  })

  describe('getPageContent', () => {
    it('reads a plain string content (hand-created file)', () => {
      expect(getPageContent({content: '<p>Hi</p>'})).toBe('<p>Hi</p>')
    })

    it('reads content.raw from a `context=edit` REST response', () => {
      expect(getPageContent({content: {raw: '<p>Hi</p>', rendered: '<p>Hi</p>'}})).toBe('<p>Hi</p>')
    })

    it('returns an empty string when there is no content', () => {
      expect(getPageContent({})).toBe('')
    })
  })

  describe('pickPageMeta', () => {
    it('keeps only fields WordPress accepts on write, plus id', () => {
      const meta = pickPageMeta({
        _links: {self: []},
        'class_list': ['page'],
        'generated_slug': 'contact',
        guid: {raw: 'https://example.com/?page_id=9', rendered: 'https://example.com/?page_id=9'},
        id: 9,
        link: 'https://example.com/contact/',
        modified: '2026-01-01T00:00:00',
        'modified_gmt': '2026-01-01T00:00:00',
        'permalink_template': 'https://example.com/%pagename%/',
        slug: 'contact',
        title: {raw: 'Contact', rendered: 'Contact'},
        type: 'page',
      })

      expect(meta).toEqual({id: 9, slug: 'contact', title: {raw: 'Contact', rendered: 'Contact'}})
    })

    it('omits a writable field entirely when the source object does not have it', () => {
      expect(pickPageMeta({id: 1})).toEqual({id: 1})
    })
  })

  describe('pageFileBase', () => {
    it('builds "<id>-<slug>" from the title', () => {
      expect(pageFileBase(9, 'About Us')).toBe('9-about-us')
    })

    it('falls back to "untitled" when the title slugifies to nothing', () => {
      expect(pageFileBase(9, '???')).toBe('9-untitled')
    })
  })
})
