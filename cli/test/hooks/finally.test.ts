import {settings} from '@oclif/core'
import {RequestError} from 'got'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {configManager} from '../../src/config/project-config.manager.js'
import hook from '../../src/hooks/finally.js'
import {scrubEvent, SENTRY_DSN} from '../../src/lib/sentry.js'

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  flush: vi.fn(),
  init: vi.fn(),
}))

vi.mock('@sentry/node', () => sentry)

type FinallyOptions = Parameters<typeof hook>[0]

function runHook(options: Partial<FinallyOptions>) {
  const debug = vi.fn()
  const context = {config: {version: '1.2.3'}, debug}
  return {
    debug,
    done: (hook as unknown as (this: unknown, o: unknown) => Promise<void>).call(context, {argv: [], ...options}),
  }
}

describe('finally hook', () => {
  beforeEach(() => {
    sentry.captureException.mockReset()
    sentry.flush.mockReset().mockResolvedValue(true)
    sentry.init.mockReset()
    vi.spyOn(configManager, 'isTelemetryDisabled').mockReturnValue(false)
    vi.stubEnv('LOOPRESS_TELEMETRY_DISABLED', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', 'test-env')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does nothing when the command succeeded', async () => {
    await runHook({}).done

    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('does nothing when telemetry is disabled, even on an error', async () => {
    vi.mocked(configManager.isTelemetryDisabled).mockReturnValue(true)

    await runHook({error: new Error('boom')}).done

    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('reports the error with a redacted argv, the command id as a tag, then flushes', async () => {
    const error = new Error('boom')

    await runHook({argv: ['https://secret.example', '--token=abc', '--yes'], error, id: 'snippet:push'}).done

    expect(sentry.init).toHaveBeenCalledWith({
      beforeSend: scrubEvent,
      dsn: SENTRY_DSN,
      environment: 'test-env',
      release: '1.2.3',
      sendDefaultPii: false,
      serverName: 'loopress',
    })
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      contexts: {runtime: expect.objectContaining({node: process.version})},
      extra: {argv: ['[REDACTED]', '--token', '--yes']},
      tags: {command: 'snippet:push'},
    })
    expect(sentry.flush).toHaveBeenCalledWith(2000)
  })

  it('swallows a reporting failure into a debug line instead of masking the original error', async () => {
    const failure = new Error('network down')
    sentry.flush.mockRejectedValueOnce(failure)

    const {debug, done} = runHook({error: new Error('boom')})
    await done

    expect(debug).toHaveBeenCalledWith('Failed to report error to Sentry: %O', failure)
  })

  describe('the got error behind a request failure', () => {
    // Built without a request: got's constructor needs one, the hook only checks the class.
    const gotError = () => Object.assign(Object.create(RequestError.prototype) as RequestError, {message: 'Request failed with status code 409', name: 'HTTPError'})

    afterEach(() => {
      settings.debug = false
    })

    it('is dropped from the printed chain, after Sentry got the whole of it', async () => {
      let causeSeenBySentry: unknown
      sentry.captureException.mockImplementation((error: Error) => {
        causeSeenBySentry = error.cause
      })
      const cause = gotError()
      const error = new Error('Request failed (409) on https://site/wp-json/loopress/v1/child-theme: The active theme is not a block theme.', {cause})

      await runHook({error}).done

      expect(causeSeenBySentry).toBe(cause)
      expect(error.cause).toBeUndefined()
    })

    it('is dropped deeper in the chain, the wrapping causes stay', async () => {
      vi.mocked(configManager.isTelemetryDisabled).mockReturnValue(true)
      const request = new Error('Request failed (409) on https://site: nope', {cause: gotError()})
      const error = new Error('Failed to remove the temporary admin account', {cause: request})

      await runHook({error}).done

      expect(error.cause).toBe(request)
      expect(request.cause).toBeUndefined()
    })

    it('stays with DEBUG, and any other cause always stays', async () => {
      vi.mocked(configManager.isTelemetryDisabled).mockReturnValue(true)
      const plain = new Error('install failed', {cause: new Error('zip missing')})
      await runHook({error: plain}).done
      expect(plain.cause).toEqual(new Error('zip missing'))

      settings.debug = true
      const debugged = new Error('Request failed (409)', {cause: gotError()})
      await runHook({error: debugged}).done
      expect(debugged.cause).toBeInstanceOf(RequestError)
    })
  })
})
