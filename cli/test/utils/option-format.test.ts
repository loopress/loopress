import {describe, expect, it} from 'vitest'

import {
  defaultReadonlyFor,
  isReservedOptionName,
  optionEndpoint,
  optionFileName,
  parseLocalOption,
  partitionByReadonly,
  READONLY_BY_DEFAULT_OPTION_NAMES,
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

  it('defaults the server-denied behaviour-changing options to readonly too', () => {
    expect(defaultReadonlyFor('default_role')).toBe(true)
    expect(defaultReadonlyFor('users_can_register')).toBe(true)
    expect(defaultReadonlyFor('mailserver_pass')).toBe(true)
    expect(defaultReadonlyFor('uninstall_plugins')).toBe(true)
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
    it('accepts refs mapping value paths to post types, and rejects anything else', () => {
      const file = {autoload: 'yes', name: 'edd_settings', value: {}}
      expect(parseLocalOption(JSON.stringify({...file, refs: {'.': 'page', purchase_page: 'page'}})).refs).toEqual({'.': 'page', purchase_page: 'page'})
      for (const refs of [['purchase_page'], {purchase_page: 12}, {'': 'page'}, {purchase_page: ''}, 'page']) {
        expect(() => parseLocalOption(JSON.stringify({...file, refs}))).toThrow('"refs" must map')
      }
    })

    it('adds declared refs to the option endpoint as a query', () => {
      expect(optionEndpoint('edd_settings', {purchase_page: 'page'})).toBe(
        `loopress/v1/options/edd_settings?refs=${encodeURIComponent('{"purchase_page":"page"}')}`,
      )
      expect(optionEndpoint('edd_settings', {})).toBe('loopress/v1/options/edd_settings')
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

  it('URL-encodes an option name that is not path-safe', () => {
    expect(optionEndpoint('a b/c')).toBe('loopress/v1/options/a%20b%2Fc')
  })

  it.each([...READONLY_BY_DEFAULT_OPTION_NAMES])('defaults %s to readonly', (name) => {
    expect(defaultReadonlyFor(name)).toBe(true)
  })

  it('keeps the exact readonly-by-default list', () => {
    expect(READONLY_BY_DEFAULT_OPTION_NAMES).toEqual([
      'siteurl',
      'home',
      'db_version',
      'initial_db_version',
      'cron',
      'rewrite_rules',
      'WPLANG',
      'default_role',
      'users_can_register',
      'uninstall_plugins',
      'mailserver_url',
      'mailserver_login',
      'mailserver_pass',
      'mailserver_port',
    ])
  })

  it('matches reserved and readonly names exactly, not by prefix or case', () => {
    expect(isReservedOptionName('active_plugins_backup')).toBe(false)
    expect(isReservedOptionName('Template')).toBe(false)
    expect(defaultReadonlyFor('wplang')).toBe(false)
    expect(defaultReadonlyFor('home_url')).toBe(false)
  })

  describe('parseLocalOption edge cases', () => {
    it.each([['null'], ['42'], ['"text"']])('rejects %s as not a JSON object', (raw) => {
      expect(() => parseLocalOption(raw)).toThrow(/^not a JSON object$/)
    })

    it.each([
      ['an empty name', {autoload: 'yes', name: '', value: 1}],
      ['a non-string name', {autoload: 'yes', name: 7, value: 1}],
    ])('rejects %s', (_label, data) => {
      expect(() => parseLocalOption(JSON.stringify(data))).toThrow(/^missing a "name" string$/)
    })

    it('reports a bad autoload as a TypeError', () => {
      expect(() => parseLocalOption(JSON.stringify({autoload: 1, name: 'x', value: 1}))).toThrow(TypeError)
    })

    it('keeps the readonly flag and any falsy value as-is', () => {
      expect(parseLocalOption(JSON.stringify({autoload: 'no', name: 'x', readonly: true, value: 0}))).toEqual({
        autoload: 'no',
        name: 'x',
        readonly: true,
        value: 0,
      })
    })

    it('rejects invalid JSON', () => {
      expect(() => parseLocalOption('{nope')).toThrow(SyntaxError)
    })
  })

  it('treats readonly: false like an absent flag', () => {
    const option = {autoload: 'yes', name: 'blogname', readonly: false, value: 'Hello'}

    expect(partitionByReadonly([option])).toEqual({skipped: [], writable: [option]})
  })
})
