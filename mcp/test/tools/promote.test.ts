import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerPromoteTools} from '../../src/tools/promote.js'
import {fakeServer} from './fake-server.js'

const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerPromoteTools(server)
  return tools
}

describe('project_promote', () => {
  beforeEach(() => runMutatingTool.mockClear())

  it('registers a single tool', () => {
    expect([...register().keys()]).toEqual(['project_promote'])
  })

  it('runs `promote <from> <to> --yes` with the extended bulk timeout, through the mutating handshake', async () => {
    const tools = register()
    await tools.get('project_promote')!({confirmToken: 'tok', from: 'staging', to: 'prod'})
    expect(runMutatingTool).toHaveBeenCalledWith('project_promote', ['promote', 'staging', 'prod', '--yes'], 'tok', {
      timeoutMs: 600_000,
    })
  })
})
