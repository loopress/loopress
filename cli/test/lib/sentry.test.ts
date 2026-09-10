import {afterEach, describe, expect, it} from 'vitest'

import {configManager} from '../../src/config/project-config.manager.js'
import {
  isTelemetryDisabled,
  redactArgv,
  resolveEnvironment,
  scrubErrorMessage,
  scrubEvent,
} from '../../src/lib/sentry.js'

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

  describe('redactArgv', () => {
    it('keeps flag names but drops their values', () => {
      expect(redactArgv(['--url', 'https://example.com', '--password', 'hunter2'])).toEqual([
        '--url',
        '[REDACTED]',
        '--password',
        '[REDACTED]',
      ])
    })

    it('keeps the flag name from --flag=value and drops the value', () => {
      expect(redactArgv(['--token=abc123'])).toEqual(['--token'])
    })

    it('redacts positional arguments', () => {
      expect(redactArgv(['https://example.com', 'jane@example.com'])).toEqual([
        '[REDACTED]',
        '[REDACTED]',
      ])
    })

    it('redacts subcommand names too, since they cannot be told apart from values here', () => {
      expect(redactArgv(['project', 'config', '--force'])).toEqual([
        '[REDACTED]',
        '[REDACTED]',
        '--force',
      ])
    })
  })

  describe('scrubErrorMessage', () => {
    it('drops the site URL and everything after the first line', () => {
      const message =
        'Request failed (500) on https://client-site.example/wp-json/loopress/v1/composer/sync: Sync failed.\n' +
        '  Problem 1\n' +
        '    - Root composer.json requires foo/bar, it could not be found at https://packages.internal.example\n' +
        '  /home/u12345/domains/client-site.example/public_html/wp-content/loopress/vendor'

      const scrubbed = scrubErrorMessage(message)

      expect(scrubbed).toBe('Request failed (500) on <site>/wp-json/loopress/v1/composer/sync: Sync failed.')
      expect(scrubbed).not.toContain('client-site.example')
      expect(scrubbed).not.toContain('packages.internal.example')
      expect(scrubbed).not.toContain('/home/u12345')
      expect(scrubbed).not.toContain('\n')
    })

    it('leaves a plain single-line message alone', () => {
      expect(scrubErrorMessage('Cannot read properties of undefined (reading id)')).toBe(
        'Cannot read properties of undefined (reading id)',
      )
    })

    it('caps very long lines', () => {
      expect(scrubErrorMessage('x'.repeat(1000))).toHaveLength(300)
    })
  })

  describe('scrubEvent', () => {
    it('scrubs the message, every chained exception value, and drops request context', () => {
      const event = {
        exception: {
          values: [
            {value: 'Request to https://client-site.example/wp-json/loopress/v1/options/foo failed'},
            {value: 'HTTPError: Response code 500\n<html>fatal at /var/www/html/wp-includes/...</html>'},
          ],
        },
        message: 'crash on https://client-site.example/wp-json/wp/v2/plugins',
        request: {data: {password: 'hunter2'}, url: 'https://client-site.example/wp-json'},
      }

      const scrubbed = scrubEvent(event as never) as typeof event

      expect(scrubbed.message).toBe('crash on <site>/wp-json/wp/v2/plugins')
      expect(scrubbed.exception.values[0].value).toBe('Request to <site>/wp-json/loopress/v1/options/foo failed')
      expect(scrubbed.exception.values[1].value).toBe('HTTPError: Response code 500')
      expect(scrubbed.request).toBeUndefined()
    })

    it('is a no-op on an event with nothing sensitive', () => {
      const event = {exception: {values: [{value: 'boom'}]}}
      expect(scrubEvent(event as never)).toEqual({exception: {values: [{value: 'boom'}]}})
    })
  })
})
