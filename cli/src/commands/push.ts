import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../lib/base.js'
import {guardProductionPush} from '../lib/guard-production-push.js'
import {stdoutToStderr} from '../lib/json-delegation.js'
import {PushCommand} from '../lib/push-command.js'
import {isLocalEnvironment} from '../lib/wp-client.js'
import {type ComposerJson, wpackagistRequire} from '../utils/composer.js'

type PushTarget = {commandId: string; label: string}

type PushTargetResult = {error?: string; label: string; status: 'failed' | 'pushed' | 'skipped'}

type PushResult = {results: PushTargetResult[]}

// Dependency-ish order: code first (plugins, composer), then the ACF definitions content
// relies on, then content itself.
const PUSH_TARGETS: PushTarget[] = [
  {commandId: 'plugin:push', label: 'plugins'},
  {commandId: 'composer:push', label: 'composer'},
  // Before ACF: a field group's location rule can target a Loopress post type or taxonomy.
  {commandId: 'cpt:push', label: 'post types'},
  {commandId: 'taxonomy:push', label: 'taxonomies'},
  {commandId: 'meta:push', label: 'post meta'},
  {commandId: 'role:push', label: 'roles'},
  {commandId: 'acf:push', label: 'ACF'},
  {commandId: 'api:push', label: 'API routes'},
  {commandId: 'hook:push', label: 'hooks'},
  {commandId: 'form:push', label: 'forms'},
  // Before templates and pages, which can reference them (`wp:pattern`).
  {commandId: 'pattern:push', label: 'patterns'},
  // Before pages: WordPress refuses a page whose `template` it doesn't know yet.
  {commandId: 'theme:template:push', label: 'templates and parts'},
  {commandId: 'page:push', label: 'pages'},
  {commandId: 'menu:push', label: 'menus'},
  {commandId: 'option:push', label: 'options'},
  {commandId: 'snippet:push', label: 'snippets'},
]

export default class Push extends LoopressCommand {
  static description =
    'Push all local content, plugins, composer dependencies, post types, taxonomies, post meta, roles, ACF, API routes, hooks, forms, patterns, templates, pages, menus, options, and snippets, to WordPress'

  static enableJsonFlag = true
  static examples = ['$ lps push', '$ lps push --env staging', '$ lps push --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
    overwrite: PushCommand.baseFlags.overwrite,
  }

  async run(): Promise<PushResult> {
    await this.guardProductionPush()
    this.warnRemovedSeoModule()

    const argv = this.buildArgv()
    const results: PushTargetResult[] = []

    const skips = await this.skippedTargets()

    for (const target of PUSH_TARGETS) {
      const skip = skips.get(target.commandId)
      if (skip) {
        this.log(`\n→ ${target.label}: ${skip.note}`)
        results.push({label: target.label, status: skip.status})
        continue
      }

      this.log(`\n→ Pushing ${target.label}...`)
      try {
        await stdoutToStderr(this.jsonEnabled(), async () => this.config.runCommand(target.commandId, argv))
        this.log(this.dryRun ? `✓ ${target.label} would push` : `✓ ${target.label} pushed`)
        results.push({label: target.label, status: 'pushed'})
      } catch (error) {
        const {message} = error as Error
        this.log(`✗ ${target.label} failed: ${message}`)
        results.push({error: message, label: target.label, status: 'failed'})
        // Stop here: later targets depend on earlier ones (hooks use what composer installs,
        // pages need their templates), so pushing them anyway can ship a silently broken site.
        const skipped = PUSH_TARGETS.slice(PUSH_TARGETS.indexOf(target) + 1).map((next) => next.label)
        const skippedNote = skipped.length > 0 ? ` Not attempted: ${skipped.join(', ')}.` : ''
        this.error(`${target.label} failed to push: ${message}.${skippedNote}`)
      }
    }

    this.log(this.dryRun ? '\nEvery resource would push.' : '\nAll resources pushed.')
    return {results}
  }

  // Every delegated push always gets --yes: either this command's own guard already confirmed
  // production once above, or the target isn't production and there's nothing to confirm.
  // Without this, each delegated command would re-run its own production guard.
  private buildArgv(): string[] {
    const argv = ['--env', this.siteConfig.name, '--yes']
    if (this.dryRun) argv.push('--dry-run')
    // Not implied by --yes: overwriting changes made outside Loopress is its own decision.
    if (this.overwrite) argv.push('--overwrite')
    return argv
  }

  // A composer.json that declares plugins is pushed whole by `plugin:push` (with its activation
  // safety), so `composer:push` would only run Composer on the server a second time.
  private async composerDeclaresPlugins(): Promise<boolean> {
    const path = this.composerJsonPath()
    if (!existsSync(path)) return false
    try {
      const composerJson = JSON.parse(await readFile(path, 'utf8')) as ComposerJson
      return Object.keys(wpackagistRequire(composerJson, 'plugin', isLocalEnvironment(this.siteConfig.name))).length > 0
    } catch {
      // Unreadable: let both commands run and report the parse error themselves.
      return false
    }
  }

  private composerJsonPath(): string {
    return join(process.cwd(), this.rootDir, 'composer.json')
  }

  // Guards once here (shared with PushCommand, lib/push-command.ts) rather than once per
  // delegated command.
  private async guardProductionPush(): Promise<void> {
    await guardProductionPush({
      dryRun: this.dryRun,
      error: (message) => this.error(message),
      siteConfig: this.siteConfig,
      yes: this.yes,
    })
  }

  // Unconfigured is not a failure: a project that doesn't manage plugins or composer through
  // Loopress must not stop the run before anything else gets pushed.
  private async skippedTargets(): Promise<Map<string, {note: string; status: 'pushed' | 'skipped'}>> {
    const skips = new Map<string, {note: string; status: 'pushed' | 'skipped'}>()
    const notConfigured = {note: 'not configured, skipped', status: 'skipped'} as const
    const hasComposerJson = existsSync(this.composerJsonPath())
    const composerPushedByPlugins = await this.composerDeclaresPlugins()

    if (composerPushedByPlugins) skips.set('composer:push', {note: 'already pushed whole by plugins', status: 'pushed'})
    else if (!hasComposerJson) skips.set('composer:push', notConfigured)

    // With a composer.json, plugins come from it only; otherwise from loopress.json.
    const pluginsConfigured = hasComposerJson ? composerPushedByPlugins : Object.keys(this.localConfig.plugins ?? {}).length > 0
    if (!pluginsConfigured) skips.set('plugin:push', notConfigured)

    return skips
  }
}
