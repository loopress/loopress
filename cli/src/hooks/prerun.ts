import type {Hook} from '@oclif/core'

import {askTelemetryConsent} from '../lib/telemetry-consent.js'

const hook: Hook.Prerun = async function ({argv, Command}) {
  // `telemetry` commands set the answer themselves, `--json` output must stay machine readable.
  if (Command.id.startsWith('telemetry') || argv.includes('--json')) return
  await askTelemetryConsent()
}

export default hook
