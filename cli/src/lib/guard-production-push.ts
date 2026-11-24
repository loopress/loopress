import {confirm} from '@inquirer/prompts'

import {isKnownCiProvider} from './ci.js'
import {isInteractive} from './interactive.js'

type GuardProductionPushOptions = {
  dryRun: boolean
  error: (message: string) => never
  onRefuse?: () => void
  siteConfig: {name: string; type: string; url: string}
  yes: boolean
}

// What a non-interactive write to an environment of type "production" needs: --yes and a
// recognized CI provider. `--yes` alone (or with a bare CI=true) in a shell that is not a known
// CI is refused: production is pushed by a human answering the prompt, or by a pipeline.
export function productionRefusal(siteConfig: {name: string}, yes: boolean): null | string {
  if (yes && isKnownCiProvider()) return null
  const how = yes
    ? '--yes alone is not enough here: no CI provider was detected.'
    : 'Pass --yes from a CI pipeline to confirm.'
  return `Target environment "${siteConfig.name}" is of type "production". ${how} Production can be changed from a terminal (answer the prompt) or from CI, never with --yes alone.`
}

// Pushing to an environment of type "production" needs explicit intent: a TTY confirmation
// (Enter accepts, or --yes at a terminal), or --yes in a recognized CI. Dry runs are exempt,
// they change nothing.
// Shared by PushCommand (lib/push-command.ts, guards a single resource push) and the
// top-level `lps push` (commands/push.ts, guards once before delegating to 8 sub-commands).
export async function guardProductionPush(options: GuardProductionPushOptions): Promise<void> {
  const {dryRun, error, onRefuse, siteConfig, yes} = options
  if (dryRun || siteConfig.type !== 'production') return

  if (!isInteractive()) {
    const refusal = productionRefusal(siteConfig, yes)
    if (refusal === null) return
    onRefuse?.()
    error(refusal)
  }

  if (yes) return

  const target = siteConfig.name === 'production' ? 'production' : siteConfig.name + ' (production)'
  const isProceed = await confirm({default: true, message: `Push to ${target} (${siteConfig.url})?`})
  if (!isProceed) {
    onRefuse?.()
    error('Aborted.')
  }
}
