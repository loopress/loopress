import {afterEach, describe, expect, it} from 'vitest'

import {configManager} from '../../src/config/project-config.manager.js'
import {
  isTelemetryDisabled,
  redactArgv,
  resolveEnvironment,
  runtimeContext,
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

  describe('scrubbing edge cases', () => {
    it.each([
      ['http and upper-case schemes', 'GET HTTP://Site.example/wp-json/wp/v2/x failed', 'GET <site>/wp-json/wp/v2/x failed'],
      ['a site in a subdirectory', 'on https://acme.com/blog/wp-json/loopress/v1/x', 'on <site>/wp-json/loopress/v1/x'],
      ['two REST URLs on one line', 'a https://a.example/wp-json/x b https://b.example/wp-json/y', 'a <site>/wp-json/x b <site>/wp-json/y'],
      ['a bare site URL', 'could not reach https://acme.com/ at all', 'could not reach <site> at all'],
      ['a URL in quotes', 'fetch "https://acme.com/page" failed', 'fetch "<site>" failed'],
      ['a URL in parentheses', '(see https://acme.com/x)', '(see <site>)'],
      ['a URL in angle brackets', '<https://acme.com/x>', '<<site>>'],
      ['a URL in single quotes', "'https://acme.com/x'", "'<site>'"],
      ['a scheme glued to a word', 'xhttps://acme.com/x', 'xhttps://acme.com/x'],
    ])('handles %s', (_label, input, expected) => {
      expect(scrubErrorMessage(input)).toBe(expected)
    })

    it('keeps exactly the first 300 characters', () => {
      const line = 'a'.repeat(299) + 'bc'

      expect(scrubErrorMessage(line)).toBe('a'.repeat(299) + 'b')
    })

    it('scrubs an empty message to an empty string', () => {
      expect(scrubErrorMessage('')).toBe('')
      expect(scrubErrorMessage('\nsecond line only')).toBe('')
    })

    it('leaves a non-string exception value and message untouched', () => {
      const event = {exception: {values: [{type: 'Error'}]}, message: undefined}

      expect(scrubEvent(event as never)).toEqual({exception: {values: [{type: 'Error'}]}, message: undefined})
    })

    it('handles an event with no exception at all', () => {
      expect(scrubEvent({message: 'https://acme.com/x\ntrace'} as never)).toEqual({message: '<site>'})
    })
  })

  describe('redactArgv edge cases', () => {
    it('keeps a bare "-" style short flag and redacts an empty argument', () => {
      expect(redactArgv(['-y', '', '--a=b=c'])).toEqual(['-y', '[REDACTED]', '--a'])
    })
  })

  describe('runtimeContext', () => {
    it('reports the Node version and the OS name and release', () => {
      const context = runtimeContext()

      expect(context.node).toBe(process.version)
      expect(context.os).toMatch(/^\S+ \S+$/)
    })
  })

  describe('resolveEnvironment edge cases', () => {
    it('ignores an empty SENTRY_ENVIRONMENT', () => {
      process.env.SENTRY_ENVIRONMENT = ''
      process.env.NODE_ENV = 'development'

      expect(resolveEnvironment()).toBe('development')
    })

    it('treats any other NODE_ENV as production', () => {
      process.env.NODE_ENV = 'test'

      expect(resolveEnvironment()).toBe('production')
    })
  })

  describe('isTelemetryDisabled edge cases', () => {
    it('only treats LOOPRESS_TELEMETRY_DISABLED=1 as disabling', () => {
      process.env.LOOPRESS_TELEMETRY_DISABLED = 'true'

      expect(isTelemetryDisabled()).toBe(false)
    })
  })
})
