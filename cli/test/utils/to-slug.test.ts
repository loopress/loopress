import {describe, expect, it} from 'vitest'

import {toSlug} from '../../src/utils/to-slug.js'

describe('toSlug', () => {
  it('lowercases and hyphenates, dropping punctuation', () => {
    expect(toSlug('Hello, World! (v2)')).toBe('hello-world-v2')
  })

  it('returns an empty string for a value that slugifies to nothing, without a fallback', () => {
    expect(toSlug('!!!')).toBe('')
  })

  it('returns the fallback for a value that slugifies to nothing', () => {
    expect(toSlug('', 'untitled')).toBe('untitled')
  })

  it('ignores the fallback when the value slugifies to something', () => {
    expect(toSlug('Contact', 'untitled')).toBe('contact')
  })
})
