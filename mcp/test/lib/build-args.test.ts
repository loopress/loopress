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

  it('appends each repeatFlags value as its own --flag occurrence, after --env', () => {
    expect(buildArgs(['acf', 'pull'], {env: 'staging', repeatFlags: {type: ['field-groups', 'taxonomies']}})).toEqual([
      'acf',
      'pull',
      '--env',
      'staging',
      '--type',
      'field-groups',
      '--type',
      'taxonomies',
    ])
  })

  it('ignores repeatFlags entries whose value is undefined or an empty array', () => {
    expect(buildArgs(['seo', 'list'], {repeatFlags: {'post-type': undefined}})).toEqual(['seo', 'list'])
    expect(buildArgs(['seo', 'list'], {repeatFlags: {'post-type': []}})).toEqual(['seo', 'list'])
  })
})
