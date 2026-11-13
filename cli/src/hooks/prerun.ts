import type {Hook} from '@oclif/core'

import {askTelemetryConsent} from '../lib/telemetry-consent.js'

const hook: Hook.Prerun = async function ({argv, Command}) {
  // `telemetry` commands set the answer themselves, `--json` output must stay machine readable.
  if (Command.id.startsWith('telemetry') || argv.includes('--json')) return
  try {
    await askTelemetryConsent()
  } catch {
    // Ctrl+C on the question: stop here, the conventional SIGINT exit code.
    this.exit(130)
  }
}

export default hook
