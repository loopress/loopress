import {describe, expect, it} from 'vitest'

import {
  defaultReadonlyFor,
  isReservedOptionName,
  optionEndpoint,
  optionFileName,
  parseLocalOption,
  partitionByReadonly,
} from '../../src/utils/option-format.js'

describe('option-format', () => {
  it('builds the option endpoint, encoding the name', () => {
    expect(optionEndpoint('wpseo_titles')).toBe('loopress/v1/options/wpseo_titles')
  })

  it('builds the local file name from the option name', () => {
    expect(optionFileName('wpseo_titles')).toBe('wpseo_titles.json')
  })

  it('flags names already owned by the plugin/theme resources as reserved', () => {
    expect(isReservedOptionName('active_plugins')).toBe(true)
    expect(isReservedOptionName('template')).toBe(true)
    expect(isReservedOptionName('stylesheet')).toBe(true)
    expect(isReservedOptionName('blogname')).toBe(false)
  })

  it('defaults environment-owned options like siteurl to readonly', () => {
    expect(defaultReadonlyFor('siteurl')).toBe(true)
    expect(defaultReadonlyFor('home')).toBe(true)
    expect(defaultReadonlyFor('blogname')).toBe(false)
  })

  describe('parseLocalOption', () => {
    it('parses a well-formed local option file', () => {
      const parsed = parseLocalOption(JSON.stringify({autoload: 'yes', name: 'blogname', value: 'Hello'}))
      expect(parsed).toEqual({autoload: 'yes', name: 'blogname', value: 'Hello'})
    })

    it('throws when the content is not a JSON object', () => {
      expect(() => parseLocalOption('[1,2,3]')).toThrow('not a JSON object')
    })

    it('throws when the "name" field is missing', () => {
      expect(() => parseLocalOption(JSON.stringify({value: 'Hello'}))).toThrow('missing a "name" string')
    })

    it('throws when "autoload" is missing or not a string', () => {
      expect(() => parseLocalOption(JSON.stringify({name: 'blogname', value: 'Hello'}))).toThrow('missing an "autoload" string')
      expect(() => parseLocalOption(JSON.stringify({autoload: true, name: 'blogname', value: 'Hello'}))).toThrow(
        'missing an "autoload" string',
      )
    })

    it('throws when the "value" field is entirely absent, but allows an explicit null', () => {
      expect(() => parseLocalOption(JSON.stringify({autoload: 'yes', name: 'blogname'}))).toThrow('missing a "value" field')
      expect(parseLocalOption(JSON.stringify({autoload: 'yes', name: 'blogname', value: null}))).toEqual({
        autoload: 'yes',
        name: 'blogname',
        value: null,
      })
    })
  })

  describe('partitionByReadonly', () => {
    it('splits tracked options into writable and skipped', () => {
      const writableOption = {autoload: 'yes', name: 'blogname', value: 'Hello'}
      const readonlyOption = {autoload: 'yes', name: 'siteurl', readonly: true, value: 'https://example.com'}

      const {skipped, writable} = partitionByReadonly([writableOption, readonlyOption])

      expect(writable).toEqual([writableOption])
      expect(skipped).toEqual([readonlyOption])
    })
  })
})
