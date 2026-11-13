import {confirm} from '@inquirer/prompts'

import {configManager} from '../config/project-config.manager.js'

const QUESTION =
  'Send anonymous crash reports to Loopress? A report has the command name, its flag names (never their values or arguments), your Node.js and OS versions, and the error message with site URLs removed. Never WordPress credentials or content. Change it anytime with `lps telemetry enable|disable`.'

function isInteractive(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY && !process.env.CI
}

// Asks once, the first time an interactive command runs. Non-interactive shells and CI never
// ask, and while the answer is unset nothing is sent (see isTelemetryDisabled). Ctrl+C leaves it
// unset, so the question comes back next time.
export async function askTelemetryConsent(): Promise<void> {
  if (process.env.LOOPRESS_TELEMETRY_DISABLED === '1') return
  if (configManager.getTelemetryConsent() !== null || !isInteractive()) return

  try {
    const answer = await confirm({default: false, message: QUESTION})
    configManager.setTelemetryDisabled(!answer)
  } catch {
    // Prompt aborted: stay undecided.
  }
}
