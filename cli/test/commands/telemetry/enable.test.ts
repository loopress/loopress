import {afterEach, describe, expect, it} from 'vitest'

import TelemetryEnable from '../../../src/commands/telemetry/enable.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

describe('telemetry enable', () => {
  afterEach(() => {
    configManager.setTelemetryDisabled(false)
  })

  it('enables telemetry from the never asked state', async () => {
    const cmd = new TelemetryEnable([], fakeOclifConfig)
    silenceLogs(cmd)
    await cmd.run()

    expect(configManager.getTelemetryConsent()).toBe(true)
  })

  it('enables telemetry and reports it', async () => {
    configManager.setTelemetryDisabled(true)

    const cmd = new TelemetryEnable([], fakeOclifConfig)
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(configManager.getTelemetryConsent()).toBe(true)
    expect(log).toHaveBeenCalledWith('Error reporting enabled.')
  })

  it('is a no-op when already enabled', async () => {
    configManager.setTelemetryDisabled(false)
    const cmd = new TelemetryEnable([], fakeOclifConfig)
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith('Error reporting is already enabled.')
  })
})
