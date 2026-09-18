import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerBulkTools} from '../../src/tools/bulk.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerBulkTools(server)
  return tools
}

describe('bulk tools', () => {
  beforeEach(() => {
    runLps.mockClear()
    runMutatingTool.mockClear()
  })

  it('registers push_all and pull_all', () => {
    expect([...register().keys()].sort()).toEqual(['pull_all', 'push_all'])
  })

  it('push_all runs `push` with the generous bulk timeout, through the mutating handshake', async () => {
    const tools = register()
    await tools.get('push_all')!({confirmToken: 'tok', env: 'staging'})
    expect(runMutatingTool).toHaveBeenCalledWith('push_all', ['push', '--env', 'staging'], 'tok', {timeoutMs: 600_000})
  })

  it('pull_all runs `pull` with the same bulk timeout as a plain read', async () => {
    const tools = register()
    await tools.get('pull_all')!({env: 'staging'})
    expect(runLps).toHaveBeenCalledWith(['pull', '--env', 'staging'], {timeoutMs: 600_000})
  })
})
