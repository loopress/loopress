import {describe, expect, it} from 'vitest'

import {isDowngrade, parseCollisions} from '../../src/utils/plugin-sync.js'

function httpError(statusCode: number, body?: string): Error {
  return new Error('failed', {cause: {response: {body, statusCode}}})
}

describe('parseCollisions', () => {
  const collisions = [
    {installedVersion: '9.4.2', path: 'wp-content/plugins/woocommerce', slug: 'woocommerce', type: 'plugin'},
  ]

  it('returns the collisions of a 422 unmanaged_plugins_present refusal', () => {
    expect(parseCollisions(httpError(422, JSON.stringify({collisions, error: 'unmanaged_plugins_present'})))).toEqual(
      collisions,
    )
  })

  it.each([
    ['another status', httpError(400, JSON.stringify({collisions, error: 'unmanaged_plugins_present'}))],
    ['no body', httpError(422)],
    ['an empty body', httpError(422, '')],
    ['a non-JSON body', httpError(422, '<html>')],
    ['another error code', httpError(422, JSON.stringify({collisions, error: 'other'}))],
    ['no collisions list', httpError(422, JSON.stringify({error: 'unmanaged_plugins_present'}))],
    [
      'a non-array collisions field',
      httpError(422, JSON.stringify({collisions: 'x', error: 'unmanaged_plugins_present'})),
    ],
    ['no cause at all', new Error('plain')],
  ])('returns null for %s', (_label, error) => {
    expect(parseCollisions(error)).toBeNull()
  })
})

describe('isDowngrade', () => {
  it.each([
    ['9.5.0', '9.4.2', true],
    ['9.4.2', '9.5.0', false],
    ['9.4.2', '9.4.2', false],
    ['latest', '9.4.2', false],
    ['9.4.2', 'latest', false],
  ])('%s to %s is %s', (from, to, expected) => {
    expect(isDowngrade(from, to)).toBe(expected)
  })
})
