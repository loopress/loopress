import {describe, expect, it, vi} from 'vitest'

import {registerApiTools} from '../../src/tools/api.js'
import {registerFormTools} from '../../src/tools/form.js'
import {registerHookTools} from '../../src/tools/hooks.js'
import {registerMenuTools} from '../../src/tools/menu.js'
import {registerSnippetTools} from '../../src/tools/snippet.js'
import {fakeServer} from './fake-server.js'

const registerResourceTools = vi.hoisted(() => vi.fn())
vi.mock('../../src/lib/resource-tools.js', () => ({registerResourceTools}))

// api/form/hooks/menu/snippet register nothing themselves, they just forward a config object to
// registerResourceTools (already covered generically by lib/resource-tools.test.ts). What can
// still regress here is the config itself: the wrong resource/pathNoun, or prune/rm toggled on a
// resource that shouldn't have them.
describe('thin resource-tools wrappers', () => {
  it('api: directory resource with prune and rm', () => {
    registerApiTools(fakeServer().server)
    expect(registerResourceTools).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({pathNoun: 'api directory', resource: 'api', supportsPrune: true, supportsRm: true}),
    )
  })

  it('form: directory resource with neither prune nor rm', () => {
    registerFormTools(fakeServer().server)
    const [, config] = registerResourceTools.mock.lastCall as [unknown, {supportsPrune?: boolean; supportsRm?: boolean}]
    expect(config).toMatchObject({pathNoun: 'forms directory', resource: 'form'})
    expect(config.supportsPrune).toBeFalsy()
    expect(config.supportsRm).toBeFalsy()
  })

  it('hooks: directory resource with prune and rm', () => {
    registerHookTools(fakeServer().server)
    expect(registerResourceTools).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({pathNoun: 'hooks directory', resource: 'hook', supportsPrune: true, supportsRm: true}),
    )
  })

  it('menu: directory resource with neither prune nor rm', () => {
    registerMenuTools(fakeServer().server)
    const [, config] = registerResourceTools.mock.lastCall as [unknown, {supportsPrune?: boolean; supportsRm?: boolean}]
    expect(config).toMatchObject({pathNoun: 'menus directory', resource: 'menu'})
    expect(config.supportsPrune).toBeFalsy()
    expect(config.supportsRm).toBeFalsy()
  })

  it('snippet: directory resource with neither prune nor rm', () => {
    registerSnippetTools(fakeServer().server)
    const [, config] = registerResourceTools.mock.lastCall as [unknown, {supportsPrune?: boolean; supportsRm?: boolean}]
    expect(config).toMatchObject({pathNoun: 'snippets directory', resource: 'snippet'})
    expect(config.supportsPrune).toBeFalsy()
    expect(config.supportsRm).toBeFalsy()
  })
})
