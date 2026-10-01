import {type Hook, settings} from '@oclif/core'
import {RequestError} from 'got'

import {
  isTelemetryDisabled,
  redactArgv,
  resolveEnvironment,
  runtimeContext,
  scrubEvent,
  SENTRY_DSN,
} from '../lib/sentry.js'

// oclif has no `command_error` hook (checked @oclif/core@4.11.11's hooks.d.ts). `finally`
// is the closest equivalent: it always runs at the end of the CLI lifecycle and carries
// the error, if any, so it's where we report crashes before the process exits.
//
// @sentry/node is imported dynamically here, only when there's actually an error to report.
// It's a heavy module (@opentelemetry deps, import-in-the-middle instrumentation), so loading
// it eagerly on every command would tax the common case where commands succeed.
const hook: Hook.Finally = async function (options) {
  if (!options.error) return

  if (!isTelemetryDisabled()) await report(this, options)
  // After the report, so Sentry still gets the whole chain. LPS_DEBUG=1 keeps it on screen too.
  if (!settings.debug) dropHttpCause(options.error)
}

async function report(context: Hook.Context, options: Parameters<Hook.Finally>[0]): Promise<void> {
  try {
    const Sentry = await import('@sentry/node')

    Sentry.init({
      // Strip the site URL and the raw server response body out of every event. A WordPress
      // request failure otherwise carries both in its message (F26).
      beforeSend: scrubEvent,
      dsn: SENTRY_DSN,
      environment: resolveEnvironment(),
      release: context.config.version,
      // Node defaults `server_name` to os.hostname(), which is often the user's real name
      // (e.g. "jane-doe-macbook-pro"). sendDefaultPii covers IP addresses and similar, off by
      // default but set explicitly since this reports from users' own machines.
      sendDefaultPii: false,
      serverName: 'loopress',
    })

    Sentry.captureException(options.error, {
      contexts: {runtime: runtimeContext()},
      extra: {argv: redactArgv(options.argv)},
      tags: {command: options.id},
    })
    await Sentry.flush(2000)
  } catch (error) {
    context.debug('Failed to report error to Sentry: %O', error)
  }
}

// WpClient and ApiClient already fold what matters of a got error (status, the server's own
// reason) into their own message, and keep got's error as `cause` for the helpers that read
// its response. oclif prints every cause after the message, so without this a clear "Request
// failed (409) on ...: The active theme is not a block theme" ends with "Caused by: HTTPError:
// Request failed with status code 409 ... Code: ERR_NON_2XX_3XX_RESPONSE", which is what the
// user remembers. Other causes (a failed plugin install under its fallback advice) stay.
export function dropHttpCause(error: Error): void {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (current.cause instanceof RequestError) {
      delete current.cause
      return
    }
  }
}

export default hook
