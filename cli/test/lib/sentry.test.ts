import {afterEach, describe, expect, it} from 'vitest'

import {consumeErrorReportingFlag, isTelemetryDisabled, resolveEnvironment} from '../../src/lib/sentry.js'

describe('sentry', () => {
  afterEach(() => {
    delete process.env.LOOPRESS_TELEMETRY_DISABLED
    delete process.env.SENTRY_ENVIRONMENT
    delete process.env.NODE_ENV
  })

  describe('consumeErrorReportingFlag', () => {
    it('removes --no-error-reporting from argv and disables telemetry', () => {
      const argv = ['snippet', 'pull', '--no-error-reporting', '--dry-run']
      consumeErrorReportingFlag(argv)

      expect(argv).toEqual(['snippet', 'pull', '--dry-run'])
      expect(process.env.LOOPRESS_TELEMETRY_DISABLED).toBe('1')
    })

    it('leaves argv and env untouched when the flag is absent', () => {
      const argv = ['snippet', 'pull', '--dry-run']
      consumeErrorReportingFlag(argv)

      expect(argv).toEqual(['snippet', 'pull', '--dry-run'])
      expect(process.env.LOOPRESS_TELEMETRY_DISABLED).toBeUndefined()
    })
  })

  describe('isTelemetryDisabled', () => {
    it('is false by default', () => {
      expect(isTelemetryDisabled()).toBe(false)
    })

    it('is true when LOOPRESS_TELEMETRY_DISABLED=1', () => {
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
