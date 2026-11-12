import {describe, expect, it} from 'vitest'

import {apiNamespaceProblem, DEFAULT_API_NAMESPACE, localApiNamespace} from '../../src/utils/api-namespace.js'

describe('apiNamespaceProblem', () => {
  it.each(['loopress-api/v1', 'my-api/v2', 'a/v10'])('accepts %s', (value) => {
    expect(apiNamespaceProblem(value)).toBeUndefined()
  })

  it.each(['loopress/v1', 'Loopress-api/v1', 'api', 'api/v', '/v1', 'api/v1/', '1api/v1', 42, undefined])('refuses %s', (value) => {
    expect(apiNamespaceProblem(value)).toEqual(expect.any(String))
  })

  it('falls back to the default namespace', () => {
    expect(localApiNamespace({})).toBe(DEFAULT_API_NAMESPACE)
    expect(localApiNamespace({api: {namespace: 'my-api/v2'}})).toBe('my-api/v2')
  })
})
