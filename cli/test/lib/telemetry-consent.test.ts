import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {configManager} from '../../src/config/project-config.manager.js'
import {askTelemetryConsent} from '../../src/lib/telemetry-consent.js'

const prompts = vi.hoisted(() => ({confirm: vi.fn()}))
vi.mock('@inquirer/prompts', () => prompts)

function setTty(value: boolean) {
  Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value})
  Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value})
}

describe('askTelemetryConsent', () => {
  beforeEach(() => {
    prompts.confirm.mockReset()
    vi.stubEnv('CI', '')
    vi.stubEnv('LOOPRESS_TELEMETRY_DISABLED', '')
    setTty(true)
    vi.spyOn(configManager, 'getTelemetryConsent').mockReturnValue(null)
    vi.spyOn(configManager, 'setTelemetryDisabled').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    setTty(false)
  })

  it('asks once and stores a no', async () => {
    prompts.confirm.mockResolvedValue(false)
    await askTelemetryConsent()

    expect(prompts.confirm).toHaveBeenCalledWith(expect.objectContaining({default: false}))
    expect(configManager.setTelemetryDisabled).toHaveBeenCalledWith(true)
  })

  it('stores a yes', async () => {
    prompts.confirm.mockResolvedValue(true)
    await askTelemetryConsent()

    expect(configManager.setTelemetryDisabled).toHaveBeenCalledWith(false)
  })

  it('never asks again once answered', async () => {
    vi.mocked(configManager.getTelemetryConsent).mockReturnValue(false)
    await askTelemetryConsent()

    expect(prompts.confirm).not.toHaveBeenCalled()
  })

  it('never asks in a non-interactive shell', async () => {
    setTty(false)
    await askTelemetryConsent()

    expect(prompts.confirm).not.toHaveBeenCalled()
    expect(configManager.setTelemetryDisabled).not.toHaveBeenCalled()
  })

  it('never asks in CI', async () => {
    vi.stubEnv('CI', 'true')
    await askTelemetryConsent()

    expect(prompts.confirm).not.toHaveBeenCalled()
  })

  it('stays undecided when the prompt is aborted', async () => {
    prompts.confirm.mockRejectedValue(new Error('aborted'))
    await askTelemetryConsent()

    expect(configManager.setTelemetryDisabled).not.toHaveBeenCalled()
  })
})
