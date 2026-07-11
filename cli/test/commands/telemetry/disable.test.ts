import {afterEach, describe, expect, it} from 'vitest'

import TelemetryDisable from '../../../src/commands/telemetry/disable.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

describe('telemetry disable', () => {
  afterEach(() => {
    configManager.setTelemetryDisabled(false)
  })

  it('disables telemetry and reports it', async () => {
    const cmd = new TelemetryDisable([], fakeOclifConfig)
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(configManager.isTelemetryDisabled()).toBe(true)
    expect(log).toHaveBeenCalledWith('Error reporting disabled.')
  })

  it('is a no-op when already disabled', async () => {
    configManager.setTelemetryDisabled(true)

    const cmd = new TelemetryDisable([], fakeOclifConfig)
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith('Error reporting is already disabled.')
  })
})
