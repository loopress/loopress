import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/meta/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

const row = {acf: false, conflict: false, key: 'isbn', managed: true, postType: 'book', showInRest: false, single: true, source: 'loopress', type: 'string'}

describe('meta list', () => {
  it('prints one line per key with its source, REST exposure and ACF overlap, and warns about conflicts', async () => {
    const keys = [
      row,
      {...row, acf: true, key: 'price', showInRest: true, type: 'number'},
      {...row, conflict: true, key: 'color', managed: false, postType: 'post', source: 'other'},
    ]
    const cmd = new List([], fakeOclifConfig)
    const logs = silenceLogs(cmd)
    const get = vi.fn().mockResolvedValue(keys)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    expect(await cmd.run()).toEqual(keys)

    expect(get).toHaveBeenCalledWith('loopress/v1/registered-post-meta')
    expect(logs.log.mock.calls.map(([line]) => line)).toEqual([
      'book.isbn (string): Loopress',
      'book.price (number): Loopress, in REST, same name as an ACF field',
      'post.color (string): theme or plugin',
    ])
    expect(logs.warn).toHaveBeenCalledTimes(1)
    expect(logs.warn).toHaveBeenCalledWith(
      'post.color: declared in meta/ but already registered by a theme or plugin, the Loopress version is skipped',
    )
  })
})
