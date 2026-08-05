import {beforeEach, describe, expect, it, vi} from 'vitest'

import {runLps} from '../../src/lib/run-lps.js'
import {runMutatingTool} from '../../src/lib/mutating-tool.js'

vi.mock('../../src/lib/run-lps.js', () => ({runLps: vi.fn()}))

const mockedRunLps = vi.mocked(runLps)

describe('runMutatingTool', () => {
  beforeEach(() => {
    mockedRunLps.mockReset()
  })

  it('without a confirmToken, runs a --dry-run preview and returns a fresh confirmToken instead of applying anything', async () => {
    mockedRunLps.mockResolvedValueOnce({data: {pushed: ['a'], status: 'dry-run'}, ok: true})

    const result = await runMutatingTool('snippet_push', ['snippet', 'push'])

    expect(mockedRunLps).toHaveBeenCalledTimes(1)
    expect(mockedRunLps).toHaveBeenCalledWith(['snippet', 'push', '--dry-run'])
    expect(result.status).toBe('preview')
    expect(result.preview).toEqual({pushed: ['a'], status: 'dry-run'})
    expect(result.confirmToken).toEqual(expect.any(String))
  })

  it('surfaces a preview failure as an error result without minting a confirmToken', async () => {
    mockedRunLps.mockResolvedValueOnce({error: {message: 'No credentials configured', name: 'Error'}, ok: false})

    const result = await runMutatingTool('snippet_push', ['snippet', 'push'])

    expect(result).toEqual({error: {message: 'No credentials configured', name: 'Error'}, status: 'error'})
  })

  it('with a valid confirmToken, applies the exact args captured at preview time (no --dry-run)', async () => {
    mockedRunLps.mockResolvedValueOnce({data: {pushed: ['a'], status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('snippet_push', ['snippet', 'push', 'demo/snippets'])

    mockedRunLps.mockResolvedValueOnce({data: {pushed: ['a'], status: 'success'}, ok: true})
    const applied = await runMutatingTool('snippet_push', ['snippet', 'push', 'demo/snippets'], preview.confirmToken)

    expect(mockedRunLps).toHaveBeenLastCalledWith(['snippet', 'push', 'demo/snippets'])
    expect(applied).toEqual({result: {pushed: ['a'], status: 'success'}, status: 'applied'})
  })

  it('ignores resubmitted args on confirm, applying whatever was actually previewed', async () => {
    mockedRunLps.mockResolvedValueOnce({data: {status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('snippet_push', ['snippet', 'push', 'original-path'])

    mockedRunLps.mockResolvedValueOnce({data: {status: 'success'}, ok: true})
    await runMutatingTool('snippet_push', ['snippet', 'push', 'a-different-path'], preview.confirmToken)

    expect(mockedRunLps).toHaveBeenLastCalledWith(['snippet', 'push', 'original-path'])
  })

  it('rejects an invalid confirmToken without calling lps again', async () => {
    const result = await runMutatingTool('snippet_push', ['snippet', 'push'], 'not-a-real-token')

    expect(mockedRunLps).not.toHaveBeenCalled()
    expect(result.status).toBe('error')
    expect(result.error?.name).toBe('INVALID_CONFIRM_TOKEN')
  })
})
