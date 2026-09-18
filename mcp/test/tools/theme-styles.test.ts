import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerThemeStylesTools} from '../../src/tools/theme-styles.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerThemeStylesTools(server)
  return tools
}

describe('theme-styles tools', () => {
  beforeEach(() => {
    runLps.mockClear()
    runMutatingTool.mockClear()
  })

  it('registers push and pull', () => {
    expect([...register().keys()].sort()).toEqual(['theme_styles_pull', 'theme_styles_push'])
  })

  it('theme_styles_push goes through the mutating handshake with no custom timeout', async () => {
    const tools = register()
    await tools.get('theme_styles_push')!({confirmToken: 'tok', env: 'staging', path: 'custom/styles.json'})
    expect(runMutatingTool).toHaveBeenCalledWith(
      'theme_styles_push',
      ['theme-styles', 'push', 'custom/styles.json', '--env', 'staging'],
      'tok',
    )
  })

  it('theme_styles_pull forwards path and env as a plain read', async () => {
    const tools = register()
    await tools.get('theme_styles_pull')!({env: 'staging', path: 'custom/styles.json'})
    expect(runLps).toHaveBeenCalledWith(['theme-styles', 'pull', 'custom/styles.json', '--env', 'staging'])
  })
})
