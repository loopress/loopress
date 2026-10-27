import {Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {guardProductionPush} from '../../lib/guard-production-push.js'
import {stdoutToStderr} from '../../lib/json-delegation.js'
import {errorMessage} from '../../lib/narrow.js'
import {pluralize} from '../../utils/pluralize.js'
import {projectHasChildThemeFiles} from '../../utils/resource-dirs.js'

// `result`: the step's own JSON result, e.g. a dry run's per-item `changes`.
type PushTargetResult = {error?: string; label: string; result?: unknown; status: 'failed' | 'pushed'}

type PushResult = {results: PushTargetResult[]}

// The parent theme must be installed before its child theme is written, and Global Styles
// belong to whichever theme is active, so they go last.
const PUSH_TARGETS = [
  {commandId: 'theme:version:push', label: 'theme versions'},
  {commandId: 'theme:template:push', label: 'templates and parts'},
  {commandId: 'theme:style:push', label: 'Global Styles'},
]

export default class Push extends LoopressCommand {
  static override description = 'Push everything theme related to WordPress: theme versions from loopress.json, then block templates and parts, then Global Styles. Switches the active theme only to the Loopress child, when loopress.json sets "activateChildTheme": true.'
  static override enableJsonFlag = true
  static override examples = ['$ lps theme push', '$ lps theme push --env staging', '$ lps theme push --dry-run']
  static override flags = {
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
    // Same for templates: without templates, parts or CSS the step would refuse (nothing to push).
    const hasChildTheme = projectHasChildThemeFiles(this.localConfig)
    const targets = PUSH_TARGETS.filter(
      (target) => (hasVersions || target.commandId !== 'theme:version:push') && (hasChildTheme || target.commandId !== 'theme:template:push'),
    )

    const results: PushTargetResult[] = []
    for (const target of targets) {
      const argv = ['--env', this.siteConfig.name, '--production-confirmed']
      if (this.yes) argv.push('--yes')
      if (this.dryRun) argv.push('--dry-run')
      if (flags.force && target.commandId === 'theme:version:push') argv.push('--force')

      this.log(`\n→ Pushing ${target.label}...`)
      try {
        const result = await stdoutToStderr(this.jsonEnabled(), async () => this.config.runCommand(target.commandId, argv))
        this.log(`✓ ${target.label} pushed`)
        results.push({label: target.label, result, status: 'pushed'})
      } catch (error) {
        const message = errorMessage(error)
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
