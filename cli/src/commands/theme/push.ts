import {Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {guardProductionPush} from '../../lib/guard-production-push.js'
import {stdoutToStderr} from '../../lib/json-delegation.js'
import {pluralize} from '../../utils/pluralize.js'

type PushTargetResult = {error?: string; label: string; status: 'failed' | 'pushed'}

type PushResult = {results: PushTargetResult[]}

// The parent theme must be installed before its child theme is written, and Global Styles
// belong to whichever theme is active, so they go last.
const PUSH_TARGETS = [
  {commandId: 'theme:version:push', label: 'theme versions'},
  {commandId: 'theme:template:push', label: 'templates and parts'},
  {commandId: 'theme:style:push', label: 'Global Styles'},
]

export default class Push extends LoopressCommand {
  static description = 'Push everything theme related to WordPress: theme versions, templates and parts, then Global Styles'
  static enableJsonFlag = true
  static examples = ['$ lps theme push', '$ lps theme push --env staging', '$ lps theme push --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
    force: Flags.boolean({default: false, description: 'Passed to `lps theme version push`'}),
  }

  async run(): Promise<PushResult> {
    const {flags} = await this.parse(Push)

    // Guarded once here, like `lps push`. Steps get --production-confirmed rather than --yes,
    // so the versions step still asks before uninstalling themes unless the user passed --yes.
    await guardProductionPush({
      dryRun: this.dryRun,
      error: (message) => this.error(message),
      siteConfig: this.siteConfig,
      yes: this.yes,
    })

    // Nothing to install and no composer.json: the versions step would only fail on an empty
    // manifest, which must not fail a templates or styles only project.
    const hasVersions =
      Object.keys(this.localConfig.themes ?? {}).length > 0 || existsSync(join(process.cwd(), this.rootDir, 'composer.json'))
    const targets = hasVersions ? PUSH_TARGETS : PUSH_TARGETS.filter((target) => target.commandId !== 'theme:version:push')

    const results: PushTargetResult[] = []
    for (const target of targets) {
      const argv = ['--env', this.siteConfig.name, '--production-confirmed']
      if (this.yes) argv.push('--yes')
      if (this.dryRun) argv.push('--dry-run')
      if (flags.force && target.commandId === 'theme:version:push') argv.push('--force')

      this.log(`\n→ Pushing ${target.label}...`)
      try {
        await stdoutToStderr(this.jsonEnabled(), async () => this.config.runCommand(target.commandId, argv))
        this.log(`✓ ${target.label} pushed`)
        results.push({label: target.label, status: 'pushed'})
      } catch (error) {
        const {message} = error as Error
        this.log(`✗ ${target.label} failed: ${message}`)
        results.push({error: message, label: target.label, status: 'failed'})
      }
    }

    const failures = results.filter((result) => result.status === 'failed')
    if (failures.length > 0) {
      const reasons = failures.map((result) => `${result.label}: ${result.error}`)
      this.error(`${pluralize(failures.length, 'theme resource')} failed to push. ${reasons.join('; ')}`)
    }

    return {results}
  }
}
