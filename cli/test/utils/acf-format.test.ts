import {describe, expect, it} from 'vitest'

import {acfEndpoint, acfFieldChanges, acfObjectEndpoint, getAcfKey} from '../../src/utils/acf-format.js'

describe('acf-format', () => {
  describe('acfFieldChanges', () => {
    it('matches top-level fields by key and names them, falling back to the key', () => {
      const before = {fields: [{key: 'f1', name: 'price'}, {key: 'f2', name: 'gone'}, {key: 'f4', name: 'same'}]}
      const after = {fields: [{key: 'f1', name: 'cost'}, {key: 'f3', name: ''}, {key: 'f4', name: 'same'}]}

      expect(acfFieldChanges(before, after)).toEqual({added: ['f3'], changed: ['cost'], removed: ['gone']})
    })

    it('treats a group without a fields array as having none', () => {
      expect(acfFieldChanges({}, {fields: [{key: 'f1', name: 'a'}]})).toEqual({added: ['a'], changed: [], removed: []})
    })
  })

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

  describe('acfFieldChanges on malformed groups', () => {
    it('reads a missing group, a group without fields and fields without a key as no fields', () => {
      expect(acfFieldChanges(undefined, {fields: [null, {name: 'no_key'}, {key: 'field_a', name: 'a'}]})).toEqual({
        added: ['a'],
        changed: [],
        removed: [],
      })
      expect(acfFieldChanges({fields: 'nope'}, {})).toEqual({added: [], changed: [], removed: []})
    })

    it('names a field without a name by its key', () => {
      expect(acfFieldChanges({fields: [{key: 'field_a', name: ''}]}, {fields: [{key: 'field_b'}]})).toEqual({
        added: ['field_b'],
        changed: [],
        removed: ['field_a'],
      })
    })
  })
})
