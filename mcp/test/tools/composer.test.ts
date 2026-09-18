import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerComposerTools} from '../../src/tools/composer.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerComposerTools(server)
  return tools
}

describe('composer tools', () => {
  beforeEach(() => {
    runLps.mockClear()
    runMutatingTool.mockClear()
  })

  it('registers push and pull', () => {
    expect([...register().keys()].sort()).toEqual(['composer_pull', 'composer_push'])
  })

  it('composer_push appends --force only when set, using the extended composer timeout', async () => {
    const tools = register()

    await tools.get('composer_push')!({confirmToken: 'tok', env: 'staging', force: true})
    expect(runMutatingTool).toHaveBeenLastCalledWith('composer_push', ['composer', 'push', '--env', 'staging', '--force'], 'tok', {
      timeoutMs: 620_000,
    })

    await tools.get('composer_push')!({confirmToken: 'tok', env: 'staging', force: false})
    expect(runMutatingTool).toHaveBeenLastCalledWith('composer_push', ['composer', 'push', '--env', 'staging'], 'tok', {
      timeoutMs: 620_000,
    })
  })

  it('composer_pull forwards env as a plain read', async () => {
    const tools = register()
    await tools.get('composer_pull')!({env: 'staging'})
    expect(runLps).toHaveBeenCalledWith(['composer', 'pull', '--env', 'staging'])
  })
})
