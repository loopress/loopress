import type {Hook} from '@oclif/core'

import * as Sentry from '@sentry/node'

import {consumeErrorReportingFlag, isTelemetryDisabled, resolveEnvironment, SENTRY_DSN} from '../lib/sentry.js'

const hook: Hook.Init = async function (options) {
  consumeErrorReportingFlag(options.argv)

  if (isTelemetryDisabled()) return

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: resolveEnvironment(),
      release: this.config.version,
    })
  } catch (error) {
    this.debug('Failed to initialize Sentry: %O', error)
  }
}

export default hook
