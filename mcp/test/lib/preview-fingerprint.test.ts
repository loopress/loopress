import {describe, expect, it} from 'vitest'

import {fingerprintPreview} from '../../src/lib/preview-fingerprint.js'

describe('fingerprintPreview', () => {
  it('is stable across different key orderings of an equivalent object', () => {
    const a = fingerprintPreview({added: [], changed: ['9'], removed: []})
    const b = fingerprintPreview({changed: ['9'], removed: [], added: []})

    expect(a).toBe(b)
  })

  it('is stable for nested objects regardless of key order', () => {
    const a = fingerprintPreview({drift: {added: ['x'], changed: [], removed: []}, id: '1'})
    const b = fingerprintPreview({id: '1', drift: {removed: [], added: ['x'], changed: []}})

    expect(a).toBe(b)
  })

  it('differs when the actual content differs', () => {
    const a = fingerprintPreview({drift: {added: [], changed: [], removed: []}})
    const b = fingerprintPreview({drift: {added: [], changed: ['9'], removed: []}})

    expect(a).not.toBe(b)
  })

  it('preserves array order (arrays are not sorted, only object keys are)', () => {
    const a = fingerprintPreview({changed: ['1', '2']})
    const b = fingerprintPreview({changed: ['2', '1']})

    expect(a).not.toBe(b)
  })

  it('handles primitives, null, and undefined values', () => {
    expect(fingerprintPreview(null)).toBe('null')
    expect(fingerprintPreview('status')).toBe('"status"')
    expect(fingerprintPreview({a: undefined, b: 1})).toBe(fingerprintPreview({b: 1}))
  })
})
