import {LoopressCommand} from '../../lib/base.js'
import {stdoutToStderr} from '../../lib/json-delegation.js'
import {pluralize} from '../../utils/pluralize.js'

type PullTargetResult = {error?: string; label: string; status: 'failed' | 'pulled'}

type PullResult = {results: PullTargetResult[]}

// Templates and parts have no pull: the child theme is written from the project, never read back.
const PULL_TARGETS = [
  {commandId: 'theme:version:pull', label: 'theme versions'},
  {commandId: 'theme:style:pull', label: 'Global Styles'},
]

export default class Pull extends LoopressCommand {
  static description = 'Pull everything theme related from WordPress: theme versions and Global Styles'
  static enableJsonFlag = true
  static examples = ['$ lps theme pull', '$ lps theme pull --env staging', '$ lps theme pull --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<PullResult> {
    const argv = ['--env', this.siteConfig.name]
    if (this.dryRun) argv.push('--dry-run')

    const results: PullTargetResult[] = []
    for (const target of PULL_TARGETS) {
      this.log(`\n→ Pulling ${target.label}...`)
      try {
        await stdoutToStderr(this.jsonEnabled(), async () => this.config.runCommand(target.commandId, argv))
        this.log(`✓ ${target.label} pulled`)
        results.push({label: target.label, status: 'pulled'})
      } catch (error) {
        const {message} = error as Error
        this.log(`✗ ${target.label} failed: ${message}`)
        results.push({error: message, label: target.label, status: 'failed'})
      }
    }

    const failures = results.filter((result) => result.status === 'failed')
    if (failures.length > 0) {
      const reasons = failures.map((result) => `${result.label}: ${result.error}`)
      this.error(`${pluralize(failures.length, 'theme resource')} failed to pull. ${reasons.join('; ')}`)
    }

    return {results}
  }
}
