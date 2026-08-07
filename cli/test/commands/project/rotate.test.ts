import {beforeEach, describe, expect, it, vi} from 'vitest'

import Rotate from '../../../src/commands/project/rotate.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {rotateAppPassword} from '../../../src/lib/rotate-app-password.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('../../../src/lib/rotate-app-password.js', () => ({rotateAppPassword: vi.fn()}))

class TestRotate extends Rotate {
  setup(siteConfig: EnvironmentConfig, projectId: string) {
    this.siteConfig = siteConfig
    this.projectId = projectId
    this.localConfig = {}
  }
}

function make(siteConfig: EnvironmentConfig = makeEnv('production', 'https://acme.com'), projectId = 'id-acme') {
  const cmd = new TestRotate([], fakeOclifConfig)
  cmd.setup(siteConfig, projectId)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('project rotate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rotates and persists the new environment', async () => {
    const rotated = makeEnv('production', 'https://acme.com', 'user:new-pass')
    vi.mocked(rotateAppPassword).mockResolvedValue(rotated)
    const setEnvironment = vi.spyOn(configManager, 'setEnvironment').mockImplementation(() => {})

    const {cmd, logs} = make()
    await cmd.run()

    expect(rotateAppPassword).toHaveBeenCalledWith(expect.objectContaining({token: 'user:pass', url: 'https://acme.com'}))
    expect(setEnvironment).toHaveBeenCalledWith('id-acme', 'production', rotated)
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('✓'))
  })

  it('errors when the environment has no credentials configured', async () => {
    const {cmd} = make({...makeEnv('production', 'https://acme.com'), token: undefined})

    await expect(cmd.run()).rejects.toThrow('No credentials configured')
    expect(rotateAppPassword).not.toHaveBeenCalled()
  })
})
