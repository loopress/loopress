import {confirm} from '@inquirer/prompts'
import {Args, Command} from '@oclif/core'

import {configManager} from '../config/project-config.manager.js'
import {LoopressCommand} from '../lib/base.js'
import {isInteractive} from '../lib/interactive.js'
import {type EnvironmentConfig} from '../types/config.js'
import {readLocalConfig} from '../utils/loopress-config.js'

export default class Promote extends Command {
  static args = {
    from: Args.string({description: 'Environment to copy the configuration from', required: true}),
    to: Args.string({description: 'Environment to copy the configuration to', required: true}),
  }

  static description =
    'Copy every tracked resource from one environment to another by pulling from <from> then pushing to <to>. Local tracked files are overwritten with <from> in the process.'

  static examples = ['$ lps promote staging production', '$ lps promote production staging --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Promote)
    const {yes} = flags
    const dryRun = flags['dry-run']

    const {environments, projectName} = await this.resolveProject()
    const from = this.requireEnvironment(environments, projectName, args.from)
    const to = this.requireEnvironment(environments, projectName, args.to)

    if (from.name === to.name) {
      this.error('<from> and <to> must be different environments.')
    }

    if (!dryRun) await this.confirmPromotion(from.name, to.name, to.url, yes)

    this.log(`\n=== Pulling from ${from.name} (${from.url}) ===`)
    try {
      await this.config.runCommand('pull', this.delegateArgv(from.name, dryRun))
    } catch (error) {
      // A partial pull must never be pushed onward: stop before touching <to>.
      this.error(`Pull from ${from.name} failed, ${to.name} left untouched: ${(error as Error).message}`)
    }

    this.log(`\n=== Pushing to ${to.name} (${to.url}) ===`)
    await this.config.runCommand('push', this.delegateArgv(to.name, dryRun))

    this.log(dryRun ? `\n[dry-run] ${from.name} would be promoted to ${to.name}.` : `\n${from.name} promoted to ${to.name}.`)
  }

  // Deliberately not `guardProductionPush`: promote overwrites local tracked files for every
  // target, not just production, so it needs its own confirmation regardless of the name. That
  // prompt also calls out production when relevant, making a second production-only guard
  // redundant.
  private async confirmPromotion(from: string, to: string, toUrl: string, yes: boolean): Promise<void> {
    if (yes) return

    const isProduction = to.toLowerCase() === 'production'
    const warning = isProduction ? ` "${to}" is a production environment.` : ''

    if (!isInteractive()) {
      this.error(
        `This overwrites local tracked files with ${from} and pushes them to ${to} (${toUrl}).${warning} Pass --yes to confirm.`,
      )
    }

    const isProceed = await confirm({
      default: !isProduction,
      message: `Promote ${from} to ${to} (${toUrl})? This overwrites local tracked files with ${from}.${warning}`,
    })
    if (!isProceed) this.error('Aborted.')
  }

  // `--yes` is always forwarded: confirmPromotion above already gathered intent once, so the
  // delegated `pull` and `push` must not prompt again (push would otherwise re-run its own
  // production guard, and pull its orphan-deletion prompt).
  private delegateArgv(env: string, dryRun: boolean): string[] {
    const argv = ['--env', env, '--yes']
    if (dryRun) argv.push('--dry-run')
    return argv
  }

  private requireEnvironment(
    environments: Record<string, EnvironmentConfig>,
    projectName: string,
    name: string,
  ): EnvironmentConfig {
    const env = environments[name]
    if (!env) {
      this.error(`Environment "${name}" not found in project "${projectName}". Available: ${Object.keys(environments).join(', ')}`)
    }

    return env
  }

  // Same project resolution as base.ts / status.ts: the pinned project from loopress.json, or
  // the globally active one.
  private async resolveProject(): Promise<{environments: Record<string, EnvironmentConfig>; projectName: string}> {
    const {projectId} = await readLocalConfig()
    const project = projectId ? configManager.getProject(projectId) : configManager.getCurrentProject()

    if (!project) {
      this.error('No project configured. Run `lps project config` first.')
    }

    if (Object.keys(project.environments).length === 0) {
      this.error(`Project "${project.name}" has no environments configured. Run \`lps project config\` to add one.`)
    }

    return {environments: project.environments, projectName: project.name}
  }
}
