import {describe, expect, it} from 'vitest'

import {acfEndpoint, acfObjectEndpoint, getAcfKey} from '../../src/utils/acf-format.js'

describe('acf-format', () => {
  describe('acfEndpoint', () => {
    it('builds the REST endpoint for each object type', () => {
      expect(acfEndpoint('field-groups')).toBe('loopress/v1/acf/field-groups')
      expect(acfEndpoint('post-types')).toBe('loopress/v1/acf/post-types')
      expect(acfEndpoint('taxonomies')).toBe('loopress/v1/acf/taxonomies')
      expect(acfEndpoint('options-pages')).toBe('loopress/v1/acf/options-pages')
    })
  })

  describe('acfObjectEndpoint', () => {
    it('builds the REST endpoint for a single object by key', () => {
      expect(acfObjectEndpoint('field-groups', 'group_1')).toBe('loopress/v1/acf/field-groups/group_1')
      expect(acfObjectEndpoint('options-pages', 'ui_options_page_1')).toBe('loopress/v1/acf/options-pages/ui_options_page_1')
    })
  })

  describe('getAcfKey', () => {
    it('returns the key when it is a non-empty string', () => {
      expect(getAcfKey({key: 'group_123'})).toBe('group_123')
    })

    it('returns null when key is missing', () => {
      expect(getAcfKey({title: 'No key'})).toBeNull()
    })

    it('returns null when key is an empty string', () => {
      expect(getAcfKey({key: ''})).toBeNull()
    })

    it('returns null when key is only whitespace', () => {
      expect(getAcfKey({key: ' '.repeat(3)})).toBeNull()
    })

    it('returns null when key is not a string', () => {
      expect(getAcfKey({key: 123})).toBeNull()
    })
  })
})
