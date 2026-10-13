import {existsSync} from 'node:fs'
import {resolve} from 'node:path'

import {LoopressCommand} from '../lib/base.js'
import {stdoutToStderr} from '../lib/json-delegation.js'
import {pluralize} from '../utils/pluralize.js'
import {resolveResourceDir, type ResourceDirKind} from '../utils/resource-dirs.js'

// `supportsYes` marks the commands that prompt before deleting orphaned local files and so
// accept `--yes` to skip it. `composer:pull` and `plugin:pull` never delete anything and do
// not define the flag, passing it to them would be a "Nonexistent flag" parse error.
// `needsPlugin`: backed by a third-party plugin (ACF, a form or a snippet plugin) the site may
// not have. Its own directory tells whether the project uses it at all.
type PullTarget = {commandId: string; label: string; needsPlugin?: ResourceDirKind; supportsYes?: boolean}

type PullTargetResult = {error?: string; label: string; status: 'failed' | 'pulled' | 'skipped'}

// How the plugin reports its integration missing: "ACF is not active", "No supported form
// plugin is active", "No supported snippet plugin is active".
const PLUGIN_MISSING = /\bis not active\b|\bNo supported .+ plugin is active\b/

type PullResult = {results: PullTargetResult[]}

// composer before plugins: when a composer.json exists, `plugin:pull` merges the live plugins
// into it, so it must run on the freshly pulled one or `composer:pull` would overwrite its work. The rest write to independent
// directories and their order does not matter, it mirrors `lps push` for familiarity.
const PULL_TARGETS: PullTarget[] = [
  {commandId: 'composer:pull', label: 'composer'},
  {commandId: 'plugin:pull', label: 'plugins'},
  {commandId: 'cpt:pull', label: 'post types', supportsYes: true},
  {commandId: 'taxonomy:pull', label: 'taxonomies', supportsYes: true},
  {commandId: 'meta:pull', label: 'post meta', supportsYes: true},
  {commandId: 'role:pull', label: 'roles', supportsYes: true},
  {commandId: 'acf:pull', label: 'ACF', needsPlugin: 'acf', supportsYes: true},
  {commandId: 'api:pull', label: 'API routes', supportsYes: true},
  {commandId: 'hook:pull', label: 'hooks', supportsYes: true},
  {commandId: 'form:pull', label: 'forms', needsPlugin: 'form', supportsYes: true},
  {commandId: 'pattern:pull', label: 'patterns', supportsYes: true},
  {commandId: 'menu:pull', label: 'menus', supportsYes: true},
  {commandId: 'option:pull', label: 'options', supportsYes: true},
  {commandId: 'snippet:pull', label: 'snippets', needsPlugin: 'snippets', supportsYes: true},
]

export default class Pull extends LoopressCommand {
  static description =
    'Pull all content, plugins, composer dependencies, post types, taxonomies, post meta, roles, ACF, API routes, hooks, forms, patterns, menus, options, and snippets, from WordPress'

  static enableJsonFlag = true
  static examples = ['$ lps pull', '$ lps pull --env staging', '$ lps pull --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  private failedCount = 0

  async run(): Promise<PullResult> {
    const results: PullTargetResult[] = []
    this.warnRemovedSeoModule()

    for (const target of PULL_TARGETS) {
      this.log(`\n→ Pulling ${target.label}...`)
      try {
        await stdoutToStderr(this.jsonEnabled(), async () => this.config.runCommand(target.commandId, this.buildArgv(target)))
        this.log(`✓ ${target.label} pulled`)
        results.push({label: target.label, status: 'pulled'})
      } catch (error) {
        const {message} = error as Error
        // A site without ACF (or a form or snippet plugin) is the common case, not a failure,
        // as long as the project doesn't use that resource: a vanilla site must pull, and a
        // promote must not stop on it. A project that does use it still fails.
        if (target.needsPlugin && PLUGIN_MISSING.test(message) && !this.usesResource(target.needsPlugin)) {
          // oclif's catch already set exitCode to 1 for the sub-command; a real failure still
          // exits non-zero through the this.error() below.
          process.exitCode = undefined
          this.log(`→ ${target.label}: not configured, skipped`)
          results.push({label: target.label, status: 'skipped'})
          continue
        }

        this.failedCount++
        this.log(`✗ ${target.label} failed: ${message}`)
        results.push({error: message, label: target.label, status: 'failed'})
      }
    }

    if (this.failedCount > 0) {
      // Each failure's own reason, not just the count: under --json the per-resource lines above
      // never reach stdout, and this message is all an MCP caller or a script gets to see.
      const failures = results.filter((result) => result.status === 'failed').map((result) => `${result.label}: ${result.error}`)
      this.error(`${pluralize(this.failedCount, 'resource')} failed to pull. ${failures.join('; ')}`)
    }

    this.log('\nAll resources pulled.')
    return {results}
  }

  // `--yes` is forwarded only when the user passed it and the target accepts it: unlike
  // `lps push`, a bare `lps pull` should still prompt before removing local files.
  private buildArgv(target: PullTarget): string[] {
    const argv = ['--env', this.siteConfig.name]
    if (this.dryRun) argv.push('--dry-run')
    if (this.yes && target.supportsYes) argv.push('--yes')
    return argv
  }

  private usesResource(kind: ResourceDirKind): boolean {
    return existsSync(resolve(resolveResourceDir(kind, this.localConfig)))
  }
}
