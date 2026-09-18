import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerPluginTools} from '../../src/tools/plugin.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerPluginTools(server)
  return tools
}

describe('plugin tools', () => {
  beforeEach(() => {
    runLps.mockClear()
    runMutatingTool.mockClear()
  })

  it('registers push, pull, status and audit', () => {
    expect([...register().keys()].sort()).toEqual(['plugin_audit', 'plugin_pull', 'plugin_push', 'plugin_status'])
  })

  it('plugin_push appends --force and --prune independently, using the extended plugin timeout', async () => {
    const tools = register()

    await tools.get('plugin_push')!({confirmToken: 'tok', env: 'staging', force: true, prune: true})
    expect(runMutatingTool).toHaveBeenLastCalledWith(
      'plugin_push',
      ['plugin', 'push', '--env', 'staging', '--force', '--prune'],
      'tok',
      {timeoutMs: 620_000},
    )

    await tools.get('plugin_push')!({confirmToken: 'tok', env: 'staging', force: false, prune: false})
    expect(runMutatingTool).toHaveBeenLastCalledWith('plugin_push', ['plugin', 'push', '--env', 'staging'], 'tok', {
      timeoutMs: 620_000,
    })
  })

  it('plugin_pull and plugin_status forward env as plain reads', async () => {
    const tools = register()

    await tools.get('plugin_pull')!({env: 'staging'})
    expect(runLps).toHaveBeenLastCalledWith(['plugin', 'pull', '--env', 'staging'])

    await tools.get('plugin_status')!({env: 'staging'})
    expect(runLps).toHaveBeenLastCalledWith(['plugin', 'status', '--env', 'staging'])
  })

  it('plugin_audit takes no env, it always checks the local loopress.json', async () => {
    const tools = register()
    await tools.get('plugin_audit')!({})
    expect(runLps).toHaveBeenCalledWith(['plugin', 'audit'])
  })
})
