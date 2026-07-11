import type {Hook} from '@oclif/core'

import {consumeErrorReportingFlag} from '../lib/sentry.js'

// Sentry itself is only imported and initialized lazily in the `finally` hook, when there's
// actually an error to report. This keeps @sentry/node (and its @opentelemetry dependencies)
// out of the module load path for the vast majority of commands, which succeed.
const hook: Hook.Init = async function (options) {
  consumeErrorReportingFlag(options.argv)
}

export default hook
