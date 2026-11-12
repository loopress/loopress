import {beforeEach, describe, expect, it, vi} from 'vitest'

import {runLps} from '../../src/lib/run-lps.js'
import {runMutatingTool} from '../../src/lib/mutating-tool.js'
import {registerRollbackTool} from '../../src/lib/resource-tools.js'
import {createSnapshot, removeSnapshot} from '../../src/lib/snapshot.js'

vi.mock('../../src/lib/run-lps.js', () => ({runLps: vi.fn()}))
vi.mock('../../src/lib/snapshot.js', () => ({createSnapshot: vi.fn(), removeSnapshot: vi.fn()}))

const mockedRunLps = vi.mocked(runLps)
const mockedCreateSnapshot = vi.mocked(createSnapshot)
const mockedRemoveSnapshot = vi.mocked(removeSnapshot)

type LpsReply = Awaited<ReturnType<typeof runLps>>

// `lps status` answers which environment a call would change (see resolveTarget); every other
// run takes the next reply queued by the test.
let statusReply: LpsReply
let queued: LpsReply[]
const STAGING: LpsReply = {data: {environment: 'staging', environmentType: 'staging'}, ok: true}

const SNAP = '/tmp/loopress-mcp-test-snapshot'

type ToolHandler = (input: Record<string, unknown>) => Promise<{content: Array<{text: string}>; isError: boolean}>

// Mirrors resource-tools.test.ts's fakeServer(): captures the handler `registerRollbackTool`
// registers, without needing a real McpServer.
function fakeServer() {
  const tools = new Map<string, ToolHandler>()
  const server = {
    registerTool(name: string, _def: unknown, handler: ToolHandler) {
      tools.set(name, handler)
    },
  }
  return {server: server as never, tools}
}

describe('runMutatingTool', () => {
  beforeEach(() => {
    statusReply = STAGING
    queued = []
    mockedRunLps.mockReset().mockImplementation(async (args) => (args[0] === 'status' ? statusReply : (queued.shift() ?? {data: {}, ok: true})))
    mockedRemoveSnapshot.mockReset()
    mockedCreateSnapshot.mockReset().mockResolvedValue(SNAP)
  })

  it('without a confirmToken, runs a --dry-run preview from a fresh snapshot and returns a token', async () => {
    queued.push({data: {pushed: ['a'], status: 'dry-run'}, ok: true})

    const result = await runMutatingTool('snippet_push', ['snippet', 'push', '--env', 'staging'])

    expect(mockedCreateSnapshot).toHaveBeenCalledTimes(1)
    expect(mockedRunLps).toHaveBeenCalledTimes(2)
    expect(mockedRunLps).toHaveBeenCalledWith(['snippet', 'push', '--env', 'staging', '--dry-run'], {cwd: SNAP})
    expect(result.status).toBe('preview')
    expect(result.preview).toEqual({pushed: ['a'], status: 'dry-run'})
    expect(result.confirmToken).toEqual(expect.any(String))
  })

  it('refuses an environment of type production, whatever its name, touching nothing', async () => {
    statusReply = {data: {environment: 'live', environmentType: 'production'}, ok: true}

    const result = await runMutatingTool('option_push', ['option', 'push', '--env', 'live'])

    expect(result.status).toBe('error')
    expect(result.error?.name).toBe('PRODUCTION_BLOCKED')
    expect(mockedRunLps).toHaveBeenCalledOnce()
    expect(mockedRunLps).toHaveBeenCalledWith(['status', '--env', 'live'])
    expect(mockedCreateSnapshot).not.toHaveBeenCalled()
  })

  it('allows an environment named production when its type is not production', async () => {
    statusReply = {data: {environment: 'production', environmentType: 'staging'}, ok: true}
    queued.push({data: {status: 'dry-run'}, ok: true})

    const result = await runMutatingTool('option_push', ['option', 'push', '--env', 'production'])

    expect(result.status).toBe('preview')
  })

  it('refuses an environment with no type, as it might be production', async () => {
    statusReply = {data: {environment: 'staging'}, ok: true}

    const result = await runMutatingTool('option_push', ['option', 'push', '--env', 'staging'])

    expect(result.error?.name).toBe('UNRESOLVED_ENVIRONMENT')
    expect(result.error?.message).toContain('no type')
    expect(mockedCreateSnapshot).not.toHaveBeenCalled()
  })

  it('without --env, pins the active environment from `lps status` into the previewed and applied args', async () => {
    queued.push({data: {status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('hook_rm', ['hook', 'rm', 'hello', '--yes'])

    expect(mockedRunLps).toHaveBeenNthCalledWith(1, ['status'])
    expect(mockedRunLps).toHaveBeenNthCalledWith(2, ['hook', 'rm', 'hello', '--yes', '--env', 'staging', '--dry-run'], {cwd: SNAP})
    expect(preview.status).toBe('preview')

    // The confirmed call reuses the pinned args and still
    // targets staging even if the active environment was switched in between.
    queued.push({data: {status: 'dry-run'}, ok: true})
    queued.push({data: {status: 'success'}, ok: true})
    await runMutatingTool('hook_rm', ['hook', 'rm', 'hello', '--yes'], preview.confirmToken)

    expect(mockedRunLps).toHaveBeenCalledTimes(5)
    expect(mockedRunLps).toHaveBeenLastCalledWith(['hook', 'rm', 'hello', '--yes', '--env', 'staging'], {cwd: SNAP})
  })

  it('without --env, refuses when the active environment is of type production, touching nothing', async () => {
    statusReply = {data: {environment: 'live', environmentType: 'production'}, ok: true}

    const result = await runMutatingTool('hook_rm', ['hook', 'rm', 'hello', '--yes'])

    expect(result.status).toBe('error')
    expect(result.error?.name).toBe('PRODUCTION_BLOCKED')
    expect(mockedCreateSnapshot).not.toHaveBeenCalled()
    expect(mockedRunLps).toHaveBeenCalledTimes(1)
  })

  it('without --env, refuses when no environment resolves, passing on the status note', async () => {
    statusReply = {data: {note: 'No project configured.'}, ok: true}

    const result = await runMutatingTool('snippet_push', ['snippet', 'push'])

    expect(result.status).toBe('error')
    expect(result.error?.name).toBe('UNRESOLVED_ENVIRONMENT')
    expect(result.error?.message).toContain('No project configured.')
    expect(mockedCreateSnapshot).not.toHaveBeenCalled()
  })

  it('without --env, surfaces a failed status lookup as an error', async () => {
    statusReply = {error: {message: 'boom', name: 'Error'}, ok: false}

    const result = await runMutatingTool('snippet_push', ['snippet', 'push'])

    expect(result).toEqual({error: {message: 'boom', name: 'Error'}, status: 'error'})
    expect(mockedCreateSnapshot).not.toHaveBeenCalled()
  })

  it('refuses a promote whose destination is of type production', async () => {
    statusReply = {data: {environment: 'live', environmentType: 'production'}, ok: true}

    const result = await runMutatingTool('promote', ['promote', 'staging', 'live', '--yes'])

    expect(result.status).toBe('error')
    expect(result.error?.name).toBe('PRODUCTION_BLOCKED')
    expect(mockedRunLps).toHaveBeenCalledOnce()
    expect(mockedRunLps).toHaveBeenCalledWith(['status', '--env', 'live'])
  })

  it('allows a promote whose destination is not production', async () => {
    queued.push({data: {status: 'dry-run'}, ok: true})

    const result = await runMutatingTool('promote', ['promote', 'production', 'staging', '--yes'])

    expect(result.status).toBe('preview')
    expect(mockedRunLps).toHaveBeenCalledWith(['status', '--env', 'staging'])
  })

  it('surfaces a preview failure as an error result, minting no token and dropping the snapshot', async () => {
    queued.push({error: {message: 'No credentials configured', name: 'Error'}, ok: false})

    const result = await runMutatingTool('snippet_push', ['snippet', 'push', '--env', 'staging'])

    expect(result).toEqual({error: {message: 'No credentials configured', name: 'Error'}, status: 'error'})
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
  })

  it('applies from the snapshot captured at preview time, then removes it', async () => {
    queued.push({data: {pushed: ['a'], status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('snippet_push', ['snippet', 'push', 'demo/snippets', '--env', 'staging'])

    // Revalidation re-runs the same dry-run; an unchanged environment reports the same preview.
    queued.push({data: {pushed: ['a'], status: 'dry-run'}, ok: true})
    queued.push({data: {pushed: ['a'], status: 'success'}, ok: true})
    const applied = await runMutatingTool('snippet_push', ['snippet', 'push', 'demo/snippets', '--env', 'staging'], preview.confirmToken)

    expect(mockedRunLps).toHaveBeenLastCalledWith(['snippet', 'push', 'demo/snippets', '--env', 'staging'], {cwd: SNAP})
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
    expect(applied).toEqual({result: {pushed: ['a'], status: 'success'}, status: 'applied'})
  })

  it('refuses a confirmed call when the environment became production since the preview', async () => {
    queued.push({data: {status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('hook_rm', ['hook', 'rm', 'hello', '--yes', '--env', 'staging'])

    statusReply = {data: {environment: 'staging', environmentType: 'production'}, ok: true}
    queued.push({data: {status: 'dry-run'}, ok: true})
    const applied = await runMutatingTool('hook_rm', ['hook', 'rm', 'hello', '--yes', '--env', 'staging'], preview.confirmToken)

    expect(applied.status).toBe('error')
    expect(mockedRunLps).not.toHaveBeenCalledWith(['hook', 'rm', 'hello', '--yes', '--env', 'staging'], {cwd: SNAP})
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
  })

  it('a file swapped between preview and confirm cannot change the push: apply reads the same frozen tree', async () => {
    queued.push({data: {status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('api_push', ['api', 'push', '--env', 'staging'])
    const previewCwd = mockedRunLps.mock.calls[1][1]?.cwd

    queued.push({data: {status: 'dry-run'}, ok: true})
    queued.push({data: {status: 'success'}, ok: true})
    await runMutatingTool('api_push', ['api', 'push', 'attacker-controlled-path'], preview.confirmToken)
    const revalidationCwd = mockedRunLps.mock.calls[2][1]?.cwd
    const applyCwd = mockedRunLps.mock.calls[4][1]?.cwd

    expect(previewCwd).toBe(SNAP)
    expect(revalidationCwd).toBe(SNAP)
    expect(applyCwd).toBe(SNAP)
    expect(mockedRunLps).toHaveBeenLastCalledWith(['api', 'push', '--env', 'staging'], {cwd: SNAP})
  })

  it('forwards options (e.g. a longer timeoutMs) to the preview, revalidation, and apply calls', async () => {
    const options = {timeoutMs: 620_000}

    queued.push({data: {status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('composer_push', ['composer', 'push', '--env', 'staging'], undefined, options)

    expect(mockedRunLps).toHaveBeenLastCalledWith(['composer', 'push', '--env', 'staging', '--dry-run'], {cwd: SNAP, timeoutMs: 620_000})

    queued.push({data: {status: 'dry-run'}, ok: true})
    queued.push({data: {status: 'success'}, ok: true})
    await runMutatingTool('composer_push', ['composer', 'push', '--env', 'staging'], preview.confirmToken, options)

    expect(mockedRunLps).toHaveBeenNthCalledWith(2, ['composer', 'push', '--env', 'staging', '--dry-run'], {cwd: SNAP, timeoutMs: 620_000})
    expect(mockedRunLps).toHaveBeenLastCalledWith(['composer', 'push', '--env', 'staging'], {cwd: SNAP, timeoutMs: 620_000})
  })

  it('rejects an invalid confirmToken without calling lps again', async () => {
    const result = await runMutatingTool('snippet_push', ['snippet', 'push'], 'not-a-real-token')

    expect(mockedRunLps).not.toHaveBeenCalled()
    expect(result.status).toBe('error')
    expect(result.error?.name).toBe('INVALID_CONFIRM_TOKEN')
  })

  it('rejects the confirmed call and drops the snapshot when the remote state changed since the preview', async () => {
    queued.push({data: {drift: undefined, status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('snippet_rollback', ['snippet', 'rollback', '--env', 'staging', '--yes'])

    // Something else touched the environment between preview and confirm: the same dry-run now
    // reports drift it didn't report before.
    queued.push({
      data: {drift: {added: [], changed: ['9'], removed: []}, status: 'dry-run'},
      ok: true,
    })
    const applied = await runMutatingTool('snippet_rollback', ['snippet', 'rollback', '--env', 'staging', '--yes'], preview.confirmToken)

    expect(applied.status).toBe('error')
    expect(applied.error?.name).toBe('STALE_PREVIEW')
    // Never reached the real (non-dry-run) apply call.
    expect(mockedRunLps).toHaveBeenCalledTimes(3)
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
  })

  it('surfaces a revalidation failure as an error result and drops the snapshot without applying', async () => {
    queued.push({data: {status: 'dry-run'}, ok: true})
    const preview = await runMutatingTool('snippet_push', ['snippet', 'push', '--env', 'staging'])

    queued.push({error: {message: 'Site unreachable', name: 'Error'}, ok: false})
    const applied = await runMutatingTool('snippet_push', ['snippet', 'push', '--env', 'staging'], preview.confirmToken)

    expect(applied).toEqual({error: {message: 'Site unreachable', name: 'Error'}, status: 'error'})
    expect(mockedRunLps).toHaveBeenCalledTimes(3)
    expect(mockedRemoveSnapshot).toHaveBeenCalledWith(SNAP)
  })

  // Through the real registerRollbackTool handler (not runMutatingTool called directly), so this
  // also exercises rollback tool registration and its argv construction (buildArgs + --yes), not
  // just the shared revalidation mechanism the tests above cover in isolation.
  it('a registered rollback tool refuses its confirmed call when drift reappears between preview and confirm', async () => {
    const {server, tools} = fakeServer()
    registerRollbackTool(server, {pathNoun: 'snippets directory', resource: 'snippet'})
    const snippetRollback = tools.get('snippet_rollback')!

    queued.push({data: {drift: undefined, status: 'dry-run'}, ok: true})
    const preview = await snippetRollback({env: 'staging'})
    expect(mockedRunLps).toHaveBeenNthCalledWith(2, ['snippet', 'rollback', '--env', 'staging', '--yes', '--dry-run'], {cwd: SNAP})
    const {confirmToken} = JSON.parse(preview.content[0].text) as {confirmToken: string}

    // Something else touched the environment between preview and confirm.
    queued.push({
      data: {drift: {added: [], changed: ['9'], removed: []}, status: 'dry-run'},
      ok: true,
    })
    const confirmed = await snippetRollback({confirmToken, env: 'staging'})

    expect(confirmed.isError).toBe(true)
    expect(JSON.parse(confirmed.content[0].text)).toEqual({
      error: {message: expect.any(String), name: 'STALE_PREVIEW'},
      status: 'error',
    })
    // Two dry-runs only: the confirmed call never reached the real (non-dry-run) apply.
    expect(mockedRunLps).toHaveBeenCalledTimes(3)
    expect(mockedRunLps).toHaveBeenNthCalledWith(3, ['snippet', 'rollback', '--env', 'staging', '--yes', '--dry-run'], {cwd: SNAP})
  })
})
