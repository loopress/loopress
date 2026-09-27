import {describe, expect, it} from 'vitest'

import {
  redirectFileBase,
  seoPostMetaEndpoint,
  seoPostMetaItemEndpoint,
  type SeoRedirect,
  seoRedirectEndpoint,
} from '../../src/utils/seo-format.js'

describe('seo-format', () => {
  it('builds the post-meta endpoint for a given post type', () => {
    expect(seoPostMetaEndpoint('page')).toBe('loopress/v1/seo/post-meta/page')
  })

  it('builds the redirect endpoint for a given id', () => {
    expect(seoRedirectEndpoint(7)).toBe('loopress/v1/seo/redirects/7')
  })

  it('builds the per-post meta endpoint with the slug URL-encoded', () => {
    expect(seoPostMetaItemEndpoint('post', 'hello world/2')).toBe('loopress/v1/seo/post-meta/post/hello%20world%2F2')
  })

  describe('redirectFileBase', () => {
    const redirect = (urlTo: string): SeoRedirect => ({
      createdAt: null,
      headerCode: 301,
      hits: 0,
      id: 4,
      sources: [],
      status: 'active',
      updatedAt: null,
      urlTo,
    })

    it('is <id>-<slug of the target URL>', () => {
      expect(redirectFileBase(redirect('/New Page/'))).toBe('4-new-page')
    })

    it('falls back to "redirect" for a target that slugifies to nothing', () => {
      expect(redirectFileBase(redirect('/'))).toBe('4-redirect')
    })
  })
})
