import {describe, expect, it} from 'vitest'

import {rankmathPostMetaEndpoint, rankmathRedirectEndpoint} from '../../src/utils/rankmath-format.js'

describe('rankmath-format', () => {
  it('builds the post-meta endpoint for a given post type', () => {
    expect(rankmathPostMetaEndpoint('page')).toBe('loopress/v1/rankmath/post-meta/page')
  })

  it('builds the redirect endpoint for a given id', () => {
    expect(rankmathRedirectEndpoint(7)).toBe('loopress/v1/rankmath/redirects/7')
  })
})
