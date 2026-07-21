import {describe, expect, it} from 'vitest'

import {seoPostMetaEndpoint, seoRedirectEndpoint} from '../../src/utils/seo-format.js'

describe('seo-format', () => {
  it('builds the post-meta endpoint for a given post type', () => {
    expect(seoPostMetaEndpoint('page')).toBe('loopress/v1/seo/post-meta/page')
  })

  it('builds the redirect endpoint for a given id', () => {
    expect(seoRedirectEndpoint(7)).toBe('loopress/v1/seo/redirects/7')
  })
})
