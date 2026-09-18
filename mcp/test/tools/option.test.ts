import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerOptionTools} from '../../src/tools/option.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerOptionTools(server)
  return tools
}

describe('option tools', () => {
  beforeEach(() => {
    runLps.mockClear()
    runMutatingTool.mockClear()
  })

  it('registers push, pull, list, add and remove', () => {
    expect([...register().keys()].sort()).toEqual(['option_add', 'option_list', 'option_pull', 'option_push', 'option_remove'])
  })

  it('option_push goes through the mutating handshake', async () => {
    const tools = register()
    await tools.get('option_push')!({confirmToken: 'tok', env: 'staging', path: 'custom/options'})
    expect(runMutatingTool).toHaveBeenCalledWith('option_push', ['option', 'push', 'custom/options', '--env', 'staging'], 'tok')
  })

  it('option_pull forwards path and env as a plain read', async () => {
    const tools = register()
    await tools.get('option_pull')!({env: 'staging', path: 'custom/options'})
    expect(runLps).toHaveBeenCalledWith(['option', 'pull', 'custom/options', '--env', 'staging'])
  })

  it('option_list appends --no-core only when set', async () => {
    const tools = register()

    await tools.get('option_list')!({env: 'staging', noCore: true})
    expect(runLps).toHaveBeenLastCalledWith(['option', 'list', '--env', 'staging', '--no-core'])

    await tools.get('option_list')!({env: 'staging', noCore: false})
    expect(runLps).toHaveBeenLastCalledWith(['option', 'list', '--env', 'staging'])
  })

  it('option_add takes the name as a positional before --env', async () => {
    const tools = register()
    await tools.get('option_add')!({env: 'staging', name: 'blogname'})
    expect(runLps).toHaveBeenCalledWith(['option', 'add', 'blogname', '--env', 'staging'])
  })

  it('option_remove takes the name as a positional and goes through the mutating handshake', async () => {
    const tools = register()
    await tools.get('option_remove')!({confirmToken: 'tok', env: 'staging', name: 'blogname'})
    expect(runMutatingTool).toHaveBeenCalledWith('option_remove', ['option', 'remove', 'blogname', '--env', 'staging'], 'tok')
  })
})
