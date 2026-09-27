import {describe, expect, it} from 'vitest'

import {getMenuSlug, menuEndpoint} from '../../src/utils/menu-format.js'

describe('menu-format', () => {
  it('builds the per-menu endpoint with the slug URL-encoded', () => {
    expect(menuEndpoint('main')).toBe('loopress/v1/menus/main')
    expect(menuEndpoint('a b/c')).toBe('loopress/v1/menus/a%20b%2Fc')
  })

  it.each([
    [{slug: 'main'}, 'main'],
    [{slug: ' main '}, ' main '],
    [{slug: ' '.repeat(3)}, null],
    [{slug: ''}, null],
    [{slug: 3}, null],
    [{}, null],
  ])('getMenuSlug(%j) is %j', (data, expected) => {
    expect(getMenuSlug(data)).toBe(expected)
  })
})
