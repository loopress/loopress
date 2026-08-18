import {confirm} from '@inquirer/prompts'

import {isInteractive} from './interactive.js'

type GuardProductionPushOptions = {
  dryRun: boolean
  error: (message: string) => never
  onRefuse?: () => void
  siteConfig: {name: string; url: string}
  yes: boolean
}

// Pushing to an environment named "production" needs explicit intent: a TTY confirmation
// (Enter accepts), or --yes in scripts and CI. Dry runs are exempt, they change nothing.
// Shared by PushCommand (lib/push-command.ts, guards a single resource push) and the
// top-level `lps push` (commands/push.ts, guards once before delegating to 8 sub-commands).
export async function guardProductionPush(options: GuardProductionPushOptions): Promise<void> {
  const {dryRun, error, onRefuse, siteConfig, yes} = options
  if (dryRun || yes || siteConfig.name.toLowerCase() !== 'production') return

  if (!isInteractive()) {
    onRefuse?.()
    error('Target environment is "production". Pass --yes to confirm the push in a non-interactive run.')
  }

  const isProceed = await confirm({default: true, message: `Push to production (${siteConfig.url})?`})
  if (!isProceed) {
    onRefuse?.()
    error('Aborted.')
  }
}
