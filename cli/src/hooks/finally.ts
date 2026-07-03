import type {Hook} from '@oclif/core'

import * as Sentry from '@sentry/node'

import {isTelemetryDisabled, runtimeContext} from '../lib/sentry.js'

// oclif has no `command_error` hook (checked @oclif/core@4.11.11's hooks.d.ts). `finally`
// is the closest equivalent: it always runs at the end of the CLI lifecycle and carries
// the error, if any, so it's where we report crashes before the process exits.
const hook: Hook.Finally = async function (options) {
  if (!options.error || isTelemetryDisabled()) return

  try {
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
