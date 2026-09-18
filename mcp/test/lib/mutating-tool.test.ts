import {beforeEach, describe, expect, it, vi} from 'vitest'

import {runLps} from '../../src/lib/run-lps.js'
import {runMutatingTool} from '../../src/lib/mutating-tool.js'
import {createSnapshot, removeSnapshot} from '../../src/lib/snapshot.js'

vi.mock('../../src/lib/run-lps.js', () => ({runLps: vi.fn()}))
vi.mock('../../src/lib/snapshot.js', () => ({createSnapshot: vi.fn(), removeSnapshot: vi.fn()}))

const mockedRunLps = vi.mocked(runLps)
const mockedCreateSnapshot = vi.mocked(createSnapshot)
const mockedRemoveSnapshot = vi.mocked(removeSnapshot)

const SNAP = '/tmp/loopress-mcp-test-snapshot'

describe('runMutatingTool', () => {
  beforeEach(() => {
    mockedRunLps.mockReset()
    mockedRemoveSnapshot.mockReset()
    mockedCreateSnapshot.mockReset().mockResolvedValue(SNAP)
  })

  it('without a confirmToken, runs a --dry-run preview from a fresh snapshot and returns a token', async () => {
    mockedRunLps.mockResolvedValueOnce({data: {pushed: ['a'], status: 'dry-run'}, ok: true})

    const result = await runMutatingTool('snippet_push', ['snippet', 'push'])

    expect(mockedCreateSnapshot).toHaveBeenCalledTimes(1)
    expect(mockedRunLps).toHaveBeenCalledTimes(1)
    expect(mockedRunLps).toHaveBeenCalledWith(['snippet', 'push', '--dry-run'], {cwd: SNAP})
    expect(result.status).toBe('preview')
    expect(result.preview).toEqual({pushed: ['a'], status: 'dry-run'})
    expect(result.confirmToken).toEqual(expect.any(String))
  })

  it('surfaces a preview failure as an error result, minting no token and dropping the snapshot', async () => {
    mockedRunLps.mockResolvedValueOnce({error: {message: 'No credentials configured', name: 'Error'}, ok: false})

    const result = await runMutatingTool('snippet_push', ['snippet', 'push'])

    expect(result).toEqual({error: {message: 'No credentials configured', name: 'Error'}, status: 'error'})
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
  })

  it('applies from the snapshot captured at preview time, then removes it', async () => {
    mockedRunLps.mockResolvedValueOnce({data: {pushed: ['a'], status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('snippet_push', ['snippet', 'push', 'demo/snippets'])

    // Revalidation re-runs the same dry-run; an unchanged environment reports the same preview.
    mockedRunLps.mockResolvedValueOnce({data: {pushed: ['a'], status: 'dry-run'}, ok: true})
    mockedRunLps.mockResolvedValueOnce({data: {pushed: ['a'], status: 'success'}, ok: true})
    const applied = await runMutatingTool('snippet_push', ['snippet', 'push', 'demo/snippets'], preview.confirmToken)

    expect(mockedRunLps).toHaveBeenLastCalledWith(['snippet', 'push', 'demo/snippets'], {cwd: SNAP})
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
    expect(applied).toEqual({result: {pushed: ['a'], status: 'success'}, status: 'applied'})
  })

  it('a file swapped between preview and confirm cannot change the push: apply reads the same frozen tree', async () => {
    mockedRunLps.mockResolvedValueOnce({data: {status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('api_push', ['api', 'push'])
    const previewCwd = mockedRunLps.mock.calls[0][1]?.cwd

    mockedRunLps.mockResolvedValueOnce({data: {status: 'dry-run'}, ok: true})
    mockedRunLps.mockResolvedValueOnce({data: {status: 'success'}, ok: true})
    await runMutatingTool('api_push', ['api', 'push', 'attacker-controlled-path'], preview.confirmToken)
    const revalidationCwd = mockedRunLps.mock.calls[1][1]?.cwd
    const applyCwd = mockedRunLps.mock.calls[2][1]?.cwd

    expect(previewCwd).toBe(SNAP)
    expect(revalidationCwd).toBe(SNAP)
    expect(applyCwd).toBe(SNAP)
    expect(mockedRunLps).toHaveBeenLastCalledWith(['api', 'push'], {cwd: SNAP})
  })

  it('forwards options (e.g. a longer timeoutMs) to the preview, revalidation, and apply calls', async () => {
    const options = {timeoutMs: 620_000}

    mockedRunLps.mockResolvedValueOnce({data: {status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('composer_push', ['composer', 'push'], undefined, options)

    expect(mockedRunLps).toHaveBeenLastCalledWith(['composer', 'push', '--dry-run'], {cwd: SNAP, timeoutMs: 620_000})

    mockedRunLps.mockResolvedValueOnce({data: {status: 'dry-run'}, ok: true})
    mockedRunLps.mockResolvedValueOnce({data: {status: 'success'}, ok: true})
    await runMutatingTool('composer_push', ['composer', 'push'], preview.confirmToken, options)

    expect(mockedRunLps).toHaveBeenNthCalledWith(2, ['composer', 'push', '--dry-run'], {cwd: SNAP, timeoutMs: 620_000})
    expect(mockedRunLps).toHaveBeenLastCalledWith(['composer', 'push'], {cwd: SNAP, timeoutMs: 620_000})
  })

  it('rejects an invalid confirmToken without calling lps again', async () => {
    const result = await runMutatingTool('snippet_push', ['snippet', 'push'], 'not-a-real-token')

    expect(mockedRunLps).not.toHaveBeenCalled()
    expect(result.status).toBe('error')
    expect(result.error?.name).toBe('INVALID_CONFIRM_TOKEN')
  })

  it('rejects the confirmed call and drops the snapshot when the remote state changed since the preview', async () => {
    mockedRunLps.mockResolvedValueOnce({data: {drift: undefined, status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('snippet_rollback', ['snippet', 'rollback', '--yes'])

    // Something else touched the environment between preview and confirm: the same dry-run now
    // reports drift it didn't report before.
    mockedRunLps.mockResolvedValueOnce({
      data: {drift: {added: [], changed: ['9'], removed: []}, status: 'dry-run'},
      ok: true,
    })
    const applied = await runMutatingTool('snippet_rollback', ['snippet', 'rollback', '--yes'], preview.confirmToken)

    expect(applied.status).toBe('error')
    expect(applied.error?.name).toBe('STALE_PREVIEW')
    // Never reached the real (non-dry-run) apply call.
    expect(mockedRunLps).toHaveBeenCalledTimes(2)
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
  })

  it('surfaces a revalidation failure as an error result and drops the snapshot without applying', async () => {
    mockedRunLps.mockResolvedValueOnce({data: {status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('snippet_push', ['snippet', 'push'])

    mockedRunLps.mockResolvedValueOnce({error: {message: 'Site unreachable', name: 'Error'}, ok: false})
    const applied = await runMutatingTool('snippet_push', ['snippet', 'push'], preview.confirmToken)

    expect(applied).toEqual({error: {message: 'Site unreachable', name: 'Error'}, status: 'error'})
    expect(mockedRunLps).toHaveBeenCalledTimes(2)
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
  })
})
