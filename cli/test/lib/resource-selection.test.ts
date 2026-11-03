import {describe, expect, it} from 'vitest'

import {parseSelectionFlag, selectResources} from '../../src/lib/resource-selection.js'

const fail = (message: string): never => {
  throw new Error(message)
}

describe('parseSelectionFlag', () => {
  it('accepts comma-separated and repeated values', () => {
    expect(parseSelectionFlag(['acf,page', ' menu '], 'only', ['acf', 'page', 'menu'], fail)).toEqual(['acf', 'page', 'menu'])
  })

  it('rejects an unknown id', () => {
    expect(() => parseSelectionFlag(['nope'], 'skip', ['acf'], fail)).toThrow('Unknown resource "nope" in --skip')
  })
})

describe('selectResources', () => {
  const all = ['a', 'b', 'c'] as const

  it('keeps the order of the full list, not of --only', () => {
    expect(selectResources(all, ['c', 'a'])).toEqual(['a', 'c'])
  })

  it('applies --skip after --only', () => {
    expect(selectResources(all, ['a', 'b'], ['b'])).toEqual(['a'])
  })
})
