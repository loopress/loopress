import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerAppTools} from '../../src/tools/app.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerAppTools(server)
  return tools
}

describe('app tools', () => {
  beforeEach(() => {
    runLps.mockClear()
    runMutatingTool.mockClear()
  })

  it('registers push, pull, list and remove', () => {
    expect([...register().keys()].sort()).toEqual(['app_list', 'app_pull', 'app_push', 'app_remove'])
  })

  it('app_push omits the name positional when not given', async () => {
    const tools = register()
    await tools.get('app_push')!({confirmToken: 'tok', env: 'staging'})
    expect(runMutatingTool).toHaveBeenCalledWith('app_push', ['app', 'push', '--env', 'staging'], 'tok')
  })

  it('app_push includes the name positional before --env when given', async () => {
    const tools = register()
    await tools.get('app_push')!({confirmToken: 'tok', env: 'staging', name: 'dashboard'})
    expect(runMutatingTool).toHaveBeenCalledWith('app_push', ['app', 'push', 'dashboard', '--env', 'staging'], 'tok')
  })

  it('app_pull forwards path and env', async () => {
    const tools = register()
    await tools.get('app_pull')!({env: 'staging', path: 'custom/apps'})
    expect(runLps).toHaveBeenCalledWith(['app', 'pull', 'custom/apps', '--env', 'staging'])
  })

  it('app_list forwards env only', async () => {
    const tools = register()
    await tools.get('app_list')!({env: 'staging'})
    expect(runLps).toHaveBeenCalledWith(['app', 'list', '--env', 'staging'])
  })

  it('app_remove requires a name and goes through the mutating handshake', async () => {
    const tools = register()
    await tools.get('app_remove')!({confirmToken: 'tok', env: 'staging', name: 'dashboard'})
    expect(runMutatingTool).toHaveBeenCalledWith('app_remove', ['app', 'remove', 'dashboard', '--env', 'staging'], 'tok')
  })
})
