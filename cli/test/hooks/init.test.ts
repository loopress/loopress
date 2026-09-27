import {describe, expect, it, vi} from 'vitest'

import {authManager} from '../../src/config/auth.manager.js'
import {configManager} from '../../src/config/project-config.manager.js'
import hook from '../../src/hooks/init.js'

describe('init hook', () => {
  it("points the config and auth managers at oclif's config and data directories", async () => {
    const setConfigDir = vi.spyOn(configManager, 'setConfigDir').mockImplementation(() => {})
    const setDataDir = vi.spyOn(authManager, 'setDataDir').mockImplementation(() => {})

    await (hook as unknown as (o: unknown) => Promise<void>)({config: {configDir: '/cfg', dataDir: '/data'}})

    expect(setConfigDir).toHaveBeenCalledWith('/cfg')
    expect(setDataDir).toHaveBeenCalledWith('/data')
  })
})
