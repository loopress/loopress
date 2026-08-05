import {describe, expect, it} from 'vitest'

import {buildArgs} from '../../src/lib/build-args.js'

describe('buildArgs', () => {
  it('appends the path as a positional before the --env flag', () => {
    expect(buildArgs(['snippet', 'push'], {env: 'staging', path: 'custom/snippets'})).toEqual([
      'snippet',
      'push',
      'custom/snippets',
      '--env',
      'staging',
    ])
  })

  it('omits path and env entirely when neither is given', () => {
    expect(buildArgs(['plugin', 'pull'], {})).toEqual(['plugin', 'pull'])
  })
})
