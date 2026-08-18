import {LoopressCommand} from '../lib/base.js'
import {guardProductionPush} from '../lib/guard-production-push.js'
import {pluralize} from '../utils/pluralize.js'

type PushTarget = {commandId: string; label: string}

// Dependency-ish order: code first (plugins, composer), then the ACF definitions content
// relies on, then content itself.
const PUSH_TARGETS: PushTarget[] = [
  {commandId: 'plugin:push', label: 'plugins'},
  {commandId: 'composer:push', label: 'composer'},
  {commandId: 'acf:push', label: 'ACF'},
  {commandId: 'api:push', label: 'API routes'},
  {commandId: 'form:push', label: 'forms'},
  {commandId: 'page:push', label: 'pages'},
  {commandId: 'seo:push', label: 'SEO'},
  {commandId: 'snippet:push', label: 'snippets'},
]

export default class Push extends LoopressCommand {
  static description = 'Push all local content, plugins, composer dependencies, ACF, API routes, forms, pages, SEO, and snippets, to WordPress'
  static examples = ['$ lps push', '$ lps push --env staging', '$ lps push --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  private failedCount = 0

  async run(): Promise<void> {
    await this.guardProductionPush()

    const argv = this.buildArgv()

    for (const target of PUSH_TARGETS) {
      this.log(`\n→ Pushing ${target.label}...`)
      try {
        await this.config.runCommand(target.commandId, argv)
        this.log(`✓ ${target.label} pushed`)
      } catch (error) {
        this.failedCount++
        this.log(`✗ ${target.label} failed: ${(error as Error).message}`)
      }
    }

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'resource')} failed to push.`)
    }

    this.log('\nAll resources pushed.')
  }

  // Every delegated push always gets --yes: either this command's own guard already confirmed
  // production once above, or the target isn't production and there's nothing to confirm.
  // Without this, each of the 8 delegated commands would re-run its own production guard.
  private buildArgv(): string[] {
    const argv = ['--env', this.siteConfig.name, '--yes']
    if (this.dryRun) argv.push('--dry-run')
    return argv
  }

  // Guards once here (shared with PushCommand, lib/push-command.ts) rather than once per
  // delegated command.
  private async guardProductionPush(): Promise<void> {
    await guardProductionPush({dryRun: this.dryRun, error: (message) => this.error(message), siteConfig: this.siteConfig, yes: this.yes})
  }
}
