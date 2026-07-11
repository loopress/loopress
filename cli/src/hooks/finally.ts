import type {Hook} from '@oclif/core'

import {isTelemetryDisabled, resolveEnvironment, runtimeContext, SENTRY_DSN} from '../lib/sentry.js'

// oclif has no `command_error` hook (checked @oclif/core@4.11.11's hooks.d.ts). `finally`
// is the closest equivalent: it always runs at the end of the CLI lifecycle and carries
// the error, if any, so it's where we report crashes before the process exits.
//
// @sentry/node is imported dynamically here, only when there's actually an error to report.
// It's a heavy module (@opentelemetry deps, import-in-the-middle instrumentation), so loading
// it eagerly on every command would tax the common case where commands succeed.
const hook: Hook.Finally = async function (options) {
  if (!options.error || isTelemetryDisabled()) return

  try {
    const Sentry = await import('@sentry/node')

    Sentry.init({
      dsn: SENTRY_DSN,
      environment: resolveEnvironment(),
      release: this.config.version,
    })

    Sentry.captureException(options.error, {
      contexts: {runtime: runtimeContext()},
      extra: {argv: options.argv},
      tags: {command: options.id},
    })
    await Sentry.flush(2000)
  } catch (error) {
    this.debug('Failed to report error to Sentry: %O', error)
  }
}

export default hook
