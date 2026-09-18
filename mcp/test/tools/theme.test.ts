import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerThemeTools} from '../../src/tools/theme.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerThemeTools(server)
  return tools
}

describe('theme tools', () => {
  beforeEach(() => {
    runLps.mockClear()
    runMutatingTool.mockClear()
  })

  it('registers push, pull and status', () => {
    expect([...register().keys()].sort()).toEqual(['theme_pull', 'theme_push', 'theme_status'])
  })

  it('theme_push appends --force only when set, using the extended theme timeout', async () => {
    const tools = register()

    await tools.get('theme_push')!({confirmToken: 'tok', env: 'staging', force: true})
    expect(runMutatingTool).toHaveBeenLastCalledWith('theme_push', ['theme', 'push', '--env', 'staging', '--force'], 'tok', {
      timeoutMs: 620_000,
    })

    await tools.get('theme_push')!({confirmToken: 'tok', env: 'staging', force: false})
    expect(runMutatingTool).toHaveBeenLastCalledWith('theme_push', ['theme', 'push', '--env', 'staging'], 'tok', {
      timeoutMs: 620_000,
    })
  })

  it('theme_pull and theme_status forward env as plain reads', async () => {
    const tools = register()

    await tools.get('theme_pull')!({env: 'staging'})
    expect(runLps).toHaveBeenLastCalledWith(['theme', 'pull', '--env', 'staging'])

    await tools.get('theme_status')!({env: 'staging'})
    expect(runLps).toHaveBeenLastCalledWith(['theme', 'status', '--env', 'staging'])
  })
})
