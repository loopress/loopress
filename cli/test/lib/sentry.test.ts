import {afterEach, describe, expect, it} from 'vitest'

import {configManager} from '../../src/config/project-config.manager.js'
import {isTelemetryDisabled, resolveEnvironment} from '../../src/lib/sentry.js'

describe('sentry', () => {
  afterEach(() => {
    delete process.env.LOOPRESS_TELEMETRY_DISABLED
    delete process.env.SENTRY_ENVIRONMENT
    delete process.env.NODE_ENV
    configManager.setTelemetryDisabled(false)
  })

  describe('isTelemetryDisabled', () => {
    it('is false by default', () => {
      expect(isTelemetryDisabled()).toBe(false)
    })

    it('is true when LOOPRESS_TELEMETRY_DISABLED=1', () => {
      process.env.LOOPRESS_TELEMETRY_DISABLED = '1'
      expect(isTelemetryDisabled()).toBe(true)
    })

    it('is true when disabled via the persisted global config', () => {
      configManager.setTelemetryDisabled(true)
      expect(isTelemetryDisabled()).toBe(true)
    })

    it('the env var overrides an enabled persisted config for a single run', () => {
      configManager.setTelemetryDisabled(false)
      process.env.LOOPRESS_TELEMETRY_DISABLED = '1'
      expect(isTelemetryDisabled()).toBe(true)
    })
  })

  describe('resolveEnvironment', () => {
    it('prefers SENTRY_ENVIRONMENT when set', () => {
      process.env.SENTRY_ENVIRONMENT = 'staging'
      expect(resolveEnvironment()).toBe('staging')
    })

    it('falls back to development when NODE_ENV=development', () => {
      process.env.NODE_ENV = 'development'
      expect(resolveEnvironment()).toBe('development')
    })

    it('falls back to production otherwise', () => {
      expect(resolveEnvironment()).toBe('production')
    })
  })
})
