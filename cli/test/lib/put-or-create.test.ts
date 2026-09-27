import {describe, expect, it, vi} from 'vitest'

import {putOrCreate} from '../../src/lib/put-or-create.js'
import {type WpClient} from '../../src/lib/wp-client.js'

function client(put: ReturnType<typeof vi.fn>, post: ReturnType<typeof vi.fn>): WpClient {
  return {post, put} as unknown as WpClient
}

const notFound = (): Error => new Error('nf', {cause: {response: {statusCode: 404}}})

describe('putOrCreate', () => {
  const base = {payload: {name: 'x'}, postEndpoint: 'things', putEndpoint: (id: number) => `things/${id}`}

  it('PUTs to the known id and reports an update', async () => {
    const put = vi.fn().mockResolvedValueOnce({id: 3})
    const post = vi.fn()

    await expect(putOrCreate(client(put, post), {...base, id: 3})).resolves.toEqual({body: {id: 3}, created: false})
    expect(put).toHaveBeenCalledWith('things/3', {name: 'x'})
    expect(post).not.toHaveBeenCalled()
  })

  it('falls back to POST with the payload when the known id 404s', async () => {
    const put = vi.fn().mockRejectedValueOnce(notFound())
    const post = vi.fn().mockResolvedValueOnce({id: 9})

    await expect(putOrCreate(client(put, post), {...base, id: 3})).resolves.toEqual({body: {id: 9}, created: true})
    expect(post).toHaveBeenCalledWith('things', {name: 'x'})
  })

  it('POSTs the distinct postPayload when one is given', async () => {
    const put = vi.fn().mockRejectedValueOnce(notFound())
    const post = vi.fn().mockResolvedValueOnce({})

    await putOrCreate(client(put, post), {
      ...base,
      id: 3,
      payload: {expectedRevision: 'r', name: 'x'},
      postPayload: {name: 'x'},
    })

    expect(put).toHaveBeenCalledWith('things/3', {expectedRevision: 'r', name: 'x'})
    expect(post).toHaveBeenCalledWith('things', {name: 'x'})
  })

  it('POSTs straight away without a known id', async () => {
    const put = vi.fn()
    const post = vi.fn().mockResolvedValueOnce({id: 1})

    await expect(putOrCreate(client(put, post), {...base, id: null})).resolves.toEqual({body: {id: 1}, created: true})
    expect(put).not.toHaveBeenCalled()
  })

  it('rethrows a PUT failure that is not a 404 without creating anything', async () => {
    const put = vi.fn().mockRejectedValueOnce(new Error('boom', {cause: {response: {statusCode: 500}}}))
    const post = vi.fn()

    await expect(putOrCreate(client(put, post), {...base, id: 3})).rejects.toThrow('boom')
    expect(post).not.toHaveBeenCalled()
  })
})
