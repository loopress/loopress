import {describe, expect, it} from 'vitest'

import {environmentUrlWarnings} from '../../src/lib/environment-urls.js'

const production = {name: 'production', url: 'https://example.com'}
const staging = {name: 'staging', url: 'https://staging.example.com'}
const local = {name: 'local', url: 'http://localhost:8080'}
const environments = [local, staging, production]

describe('environmentUrlWarnings', () => {
  it('warns about an absolute URL to another environment of the project', () => {
    const warnings = environmentUrlWarnings(
      [{id: 'pages/about', value: '<a href="https://staging.example.com/contact">Contact</a> <img src="http://localhost:8080/a.png">'}],
      production,
      environments,
    )

    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('pages/about links to the "staging" environment (staging.example.com)')
    expect(warnings[0]).toContain('https://staging.example.com/contact')
    expect(warnings[1]).toContain('"local" environment (localhost:8080)')
  })

  it('lets relative paths, the target environment and external hosts pass', () => {
    const value = '<a href="/contact">a</a> <a href="https://example.com/b">b</a> <a href="https://wordpress.org">c</a>'
    expect(environmentUrlWarnings([{id: 'pages/about', value}], production, environments)).toEqual([])
  })

  it('tells environments apart by port', () => {
    const value = 'http://localhost:8080/x'
    expect(environmentUrlWarnings([{id: 'x', value}], {name: 'other', url: 'http://localhost:8081'}, [local])).toHaveLength(1)
    expect(environmentUrlWarnings([{id: 'x', value}], local, environments)).toEqual([])
  })

  it('scans nested option values and JSON-escaped URLs, once per item and host', () => {
    const value = {links: ['https://STAGING.example.com/a', String.raw`https:\/\/staging.example.com\/b`], nested: {url: 'https://staging.example.com/a'}}
    const warnings = environmentUrlWarnings([{id: 'options/footer', value}], production, environments)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('options/footer')
  })

  it('has nothing to compare against in a single-environment project', () => {
    expect(environmentUrlWarnings([{id: 'x', value: 'https://staging.example.com'}], production, [production])).toEqual([])
  })
})
