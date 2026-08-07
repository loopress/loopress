import {describe, expect, it} from 'vitest'

import {FORM_ENDPOINT, getFormId, getFormTitle} from '../../src/utils/form-format.js'

describe('form-format', () => {
  it('exposes the forms REST endpoint', () => {
    expect(FORM_ENDPOINT).toBe('loopress/v1/forms')
  })

  describe('getFormId', () => {
    it('returns the numeric id when present', () => {
      expect(getFormId({id: 7})).toBe(7)
    })

    it('coerces a numeric string id', () => {
      expect(getFormId({id: '7'})).toBe(7)
    })

    it('returns null when id is missing', () => {
      expect(getFormId({})).toBeNull()
    })

    it('returns null when id is zero', () => {
      expect(getFormId({id: 0})).toBeNull()
    })

    it('returns null when id is negative', () => {
      expect(getFormId({id: -1})).toBeNull()
    })

    it('returns null when id is not an integer', () => {
      expect(getFormId({id: 1.5})).toBeNull()
    })

    it('returns null when id is not numeric at all', () => {
      expect(getFormId({id: 'not-a-number'})).toBeNull()
    })
  })

  describe('getFormTitle', () => {
    it('returns settings.form_title when present', () => {
       
      expect(getFormTitle({settings: {form_title: 'Contact Us'}})).toBe('Contact Us')
    })

    it('returns "(untitled)" when settings is missing', () => {
      expect(getFormTitle({})).toBe('(untitled)')
    })

    it('returns "(untitled)" when form_title is missing', () => {
      expect(getFormTitle({settings: {}})).toBe('(untitled)')
    })

    it('returns "(untitled)" when form_title is blank', () => {
       
      expect(getFormTitle({settings: {form_title: ' '.repeat(3)}})).toBe('(untitled)')
    })

    it('returns "(untitled)" when form_title is not a string', () => {
       
      expect(getFormTitle({settings: {form_title: 42}})).toBe('(untitled)')
    })
  })
})
