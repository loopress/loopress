import {describe, expect, it} from 'vitest'

import {pluralize} from '../../src/utils/pluralize.js'

describe('pluralize', () => {
  it.each([
    [0, 'form', undefined, '0 forms'],
    [1, 'form', undefined, '1 form'],
    [2, 'form', undefined, '2 forms'],
    [1, 'box', 'boxes', '1 box'],
    [3, 'box', 'boxes', '3 boxes'],
  ])('pluralize(%i, %s, %s) is "%s"', (count, singular, plural, expected) => {
    expect(pluralize(count, singular, plural)).toBe(expected)
  })
})
