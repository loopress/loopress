import {describe, expect, it} from 'vitest'

import {compareVersions, isExactVersion} from '../../src/utils/version.js'

describe('isExactVersion', () => {
  it('accepts 2-4 segment versions with an optional prerelease tag', () => {
    // eslint-disable-next-line sonarjs/no-hardcoded-ip -- "4.9.8.2" is a 4-segment plugin version, not an IP
    for (const v of ['6.0', '9.4.2', '4.9.8.2', '3.0.0-beta1', '2.1.0-RC.2']) {
      expect(isExactVersion(v), v).toBe(true)
    }
  })

  it('rejects Composer constraints and junk', () => {
    for (const v of ['^9.4', '~1.2', '>=8.0', '*', '9.4.x', '9.4.2 || 9.5.0', 'latest', '', 'garbage']) {
      expect(isExactVersion(v), v).toBe(false)
    }
  })

  it('rejects a prerelease suffix on fewer than 3 numeric segments', () => {
    // compare-versions' own validate() (which compareVersions() defers to) can't order these,
    // so accepting them here would let isDowngrade() silently treat a real downgrade as
    // unorderable and skip the --force gate.
    for (const v of ['9-beta', '0.9-beta', '6.0-RC.2']) {
      expect(isExactVersion(v), v).toBe(false)
    }
  })
})

describe('compareVersions', () => {
  it('orders numerically and puts a prerelease below the matching release', () => {
    expect(compareVersions('9.10.0', '9.9.0')).toBe(1)
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1)
    expect(compareVersions('6.0', '6.0.0')).toBe(0)
  })

  it('returns null when either side is not a comparable version', () => {
    expect(compareVersions('latest', '9.4.2')).toBeNull()
    expect(compareVersions('9.4.2', 'nonsense')).toBeNull()
  })
})
