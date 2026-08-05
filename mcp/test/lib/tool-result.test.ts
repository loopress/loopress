import {describe, expect, it} from 'vitest'

import {toCallToolResult, unwrap} from '../../src/lib/tool-result.js'

describe('unwrap', () => {
  it('passes through the data on a successful result', () => {
    expect(unwrap({data: [1, 2, 3], ok: true})).toEqual([1, 2, 3])
  })

  it('wraps the error on a failed result', () => {
    expect(unwrap({error: {message: 'boom', name: 'Error'}, ok: false})).toEqual({error: {message: 'boom', name: 'Error'}})
  })
})

describe('toCallToolResult', () => {
  it('marks the result as an error when the payload carries an error field', () => {
    const result = toCallToolResult({error: {message: 'boom', name: 'Error'}})

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text)).toEqual({error: {message: 'boom', name: 'Error'}})
  })

  it('is not an error for a plain successful payload, including an array', () => {
    expect(toCallToolResult([1, 2, 3]).isError).toBe(false)
    expect(toCallToolResult({status: 'success'}).isError).toBe(false)
  })
})
