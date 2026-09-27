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
})
