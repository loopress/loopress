import {describe, expect, it} from 'vitest'

import {yoastPostMetaEndpoint} from '../../src/utils/yoast-format.js'

describe('yoast-format', () => {
  it('builds the post-meta endpoint for a given post type', () => {
    expect(yoastPostMetaEndpoint('page')).toBe('loopress/v1/yoast/post-meta/page')
  })
})
