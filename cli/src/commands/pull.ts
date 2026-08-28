import {LoopressCommand} from '../lib/base.js'
import {pluralize} from '../utils/pluralize.js'

// `supportsYes` marks the commands that prompt before deleting orphaned local files and so
// accept `--yes` to skip it. `composer:pull` and `plugin:pull` never delete anything and do
// not define the flag, passing it to them would be a "Nonexistent flag" parse error.
type PullTarget = {commandId: string; label: string; supportsYes?: boolean}

// composer before plugins: `plugin:pull` reads the local composer.json to skip
// Composer-managed plugins, so it needs the freshly pulled one. The rest write to independent
// directories and their order does not matter, it mirrors `lps push` for familiarity.
const PULL_TARGETS: PullTarget[] = [
  {commandId: 'composer:pull', label: 'composer'},
  {commandId: 'plugin:pull', label: 'plugins'},
  {commandId: 'acf:pull', label: 'ACF', supportsYes: true},
  {commandId: 'api:pull', label: 'API routes', supportsYes: true},
  {commandId: 'form:pull', label: 'forms', supportsYes: true},
  {commandId: 'page:pull', label: 'pages', supportsYes: true},
  {commandId: 'seo:pull', label: 'SEO', supportsYes: true},
  {commandId: 'snippet:pull', label: 'snippets', supportsYes: true},
]

export default class Pull extends LoopressCommand {
  static description = 'Pull all content, plugins, composer dependencies, ACF, API routes, forms, pages, SEO, and snippets, from WordPress'
  static examples = ['$ lps pull', '$ lps pull --env staging', '$ lps pull --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  private failedCount = 0

  async run(): Promise<void> {
    for (const target of PULL_TARGETS) {
      this.log(`\n→ Pulling ${target.label}...`)
      try {
        await this.config.runCommand(target.commandId, this.buildArgv(target))
        this.log(`✓ ${target.label} pulled`)
      } catch (error) {
        this.failedCount++
        this.log(`✗ ${target.label} failed: ${(error as Error).message}`)
      }
    }

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'resource')} failed to pull.`)
    }

    this.log('\nAll resources pulled.')
  }

  // `--yes` is forwarded only when the user passed it and the target accepts it: unlike
  // `lps push`, a bare `lps pull` should still prompt before removing local files.
  private buildArgv(target: PullTarget): string[] {
    const argv = ['--env', this.siteConfig.name]
    if (this.dryRun) argv.push('--dry-run')
    if (this.yes && target.supportsYes) argv.push('--yes')
    return argv
  }
}
