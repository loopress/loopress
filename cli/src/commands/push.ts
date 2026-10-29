import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../lib/base.js'
import {integrationFix, type MissingIntegration, missingIntegration, missingModule} from '../lib/capabilities.js'
import {guardProductionPush} from '../lib/guard-production-push.js'
import {stdoutToStderr} from '../lib/json-delegation.js'
import {errorMessage} from '../lib/narrow.js'
import {PushCommand} from '../lib/push-command.js'
import {isLocalEnvironment} from '../lib/wp-client.js'
import {pinActive} from '../types/plugin.js'
import {parseComposerJson, wpackagistRequire} from '../utils/composer.js'
import {projectHasChildThemeFiles, projectUses, resolveResourceDir, type ResourceDirKind} from '../utils/resource-dirs.js'
import {globalStylesSkipNote} from '../utils/theme-styles-format.js'

type PushTarget = {commandId: string; label: string}

// `result`: the step's own JSON result, e.g. a dry run's per-item `changes`.
type PushTargetResult = {error?: string; label: string; result?: unknown; status: 'failed' | 'pushed' | 'skipped'}

type PushResult = {results: PushTargetResult[]}

type Skip = {note: string; status: 'pushed' | 'skipped'}

// A step the site may be unable to hold: `skipUnused` skips it whenever the project doesn't use
// it, otherwise only when the site lacks it.
type SiteStep = {commandId: string; missing: MissingIntegration | undefined; skipUnused: boolean; used: boolean}

// Backed by a plugin the site may not have (ACF, a form or a snippet plugin): a project without
// the resource's directory doesn't use it, and its push, dry run included, would only stop on the
// site's 409 or the missing directory.
const PLUGIN_BACKED: Record<string, ResourceDirKind> = {'acf:push': 'acf', 'form:push': 'form', 'snippet:push': 'snippets'}

// Features of Loopress Full only: on Light, skipped while the project doesn't use them, refused
// upfront when it does. On Full they run as usual, used or not.
const FULL_ONLY: Record<string, ResourceDirKind> = {'api:push': 'api', 'block:push': 'block', 'hook:push': 'hooks', 'page:push': 'page', 'pattern:push': 'pattern'}

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
  // Before templates and pages, which place them (`wp:loopress/<slug>`).
  {commandId: 'block:push', label: 'dynamic blocks'},
  {commandId: 'form:push', label: 'forms'},
  // Before templates and pages, which can reference them (`wp:pattern`).
  {commandId: 'pattern:push', label: 'patterns'},
  // Before pages: WordPress refuses a page whose `template` it doesn't know yet.
  {commandId: 'theme:template:push', label: 'templates and parts'},
  // Belong to whichever theme is active, so right after its templates. Theme versions stay out:
  // installing or removing themes is `lps theme push`'s call.
  {commandId: 'theme:style:push', label: 'Global Styles'},
  {commandId: 'page:push', label: 'pages'},
  {commandId: 'menu:push', label: 'menus'},
  {commandId: 'option:push', label: 'options'},
  {commandId: 'snippet:push', label: 'snippets'},
]

export default class Push extends LoopressCommand {
  static override description =
    'Push every local resource to WordPress in one run: plugins, composer dependencies, post types, taxonomies, post meta, roles, ACF, API routes, hooks, dynamic blocks, forms, patterns, templates and parts, Global Styles, pages, menus, options, and snippets'

  static override enableJsonFlag = true
  static override examples = ['$ lps push', '$ lps push --env staging', '$ lps push --dry-run']
  static override flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
    overwrite: PushCommand.baseFlags.overwrite,
  }

  async run(): Promise<PushResult> {
    await this.guardProductionPush()

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
        const result = await stdoutToStderr(this.jsonEnabled(), async () => this.config.runCommand(target.commandId, argv))
        this.log(this.dryRun ? `✓ ${target.label} would push` : `✓ ${target.label} pushed`)
        results.push({label: target.label, result, status: 'pushed'})
      } catch (error) {
        const message = errorMessage(error)
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

  // A step the project uses on a site that can't hold it would only fail at its turn, after
  // everything before it was pushed: refuse the whole run upfront, saying how to fix it. An unused
  // one is skipped, saying why when the site lacks it.
  private applySiteSteps(steps: SiteStep[], skips: Map<string, Skip>, declared: {fromComposer: boolean; plugins: string[]}): void {
    const blockers: string[] = []
    for (const {commandId, missing, skipUnused, used} of steps) {
      if (used && missing) {
        const label = PUSH_TARGETS.find((target) => target.commandId === commandId)?.label
        const fix = integrationFix(missing, declared)
        const fixSentence = fix ? ` ${fix}.` : ''
        blockers.push(`${label}: ${missing.reason} on ${this.siteConfig.name}.${fixSentence}`)
      } else if (!used && missing?.needsFull) {
        skips.set(commandId, {note: `${missing.reason}, skipped`, status: 'skipped'})
      } else if (!used && skipUnused) {
        skips.set(commandId, {note: 'not configured, skipped', status: 'skipped'})
      }
    }

    if (blockers.length > 0) this.error(`Nothing was pushed, the project uses what this site can't hold:\n  ${blockers.join('\n  ')}`)
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

  private composerJsonPath(): string {
    return join(process.cwd(), this.rootDir, 'composer.json')
  }

  // The wordpress.org plugins the project declares: composer.json's wpackagist plugins when it
  // exists, loopress.json's otherwise. Unreadable or invalid composer.json: none, the commands report it.
  private async declaredPlugins(hasComposerJson: boolean): Promise<string[]> {
    if (!hasComposerJson) return Object.keys(this.localConfig.plugins ?? {})
    try {
      const composerJson = parseComposerJson(await readFile(this.composerJsonPath(), 'utf8'))
      return Object.keys(wpackagistRequire(composerJson, 'plugin', isLocalEnvironment(this.siteConfig.name)))
    } catch {
      return []
    }
  }

  // The site unreachable or the theme list refused: let the step run and report it itself.
  private async globalStylesSkipNote(): Promise<string | undefined> {
    try {
      return await globalStylesSkipNote(this.wp, resolveResourceDir('themeStyles', this.localConfig), 'push')
    } catch {
      return undefined
    }
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
  private async skippedTargets(): Promise<Map<string, Skip>> {
    const skips = new Map<string, Skip>()
    const notConfigured = {note: 'not configured, skipped', status: 'skipped'} as const
    const hasComposerJson = existsSync(this.composerJsonPath())
    const declaredPlugins = await this.declaredPlugins(hasComposerJson)
    // A composer.json that declares plugins is pushed whole by `plugin:push` (with its activation
    // safety), so `composer:push` would only run Composer on the server a second time.
    const composerPushedByPlugins = hasComposerJson && declaredPlugins.length > 0

    if (composerPushedByPlugins) skips.set('composer:push', {note: 'already pushed whole by plugins', status: 'pushed'})
    else if (!hasComposerJson) skips.set('composer:push', notConfigured)

    // With a composer.json, plugins come from it only; otherwise from loopress.json.
    if (declaredPlugins.length === 0) skips.set('plugin:push', notConfigured)

    const capabilities = await this.capabilities()
    // Installed and activated by this run's first step, before the steps that need them: a fresh
    // site (CI, a new staging) gets ACF from loopress.json and its field groups in one push.
    // composer.json records no active state, so its plugins stay inactive until --activate.
    const activatedByPush = hasComposerJson ? [] : declaredPlugins.filter((slug) => pinActive(this.localConfig.plugins?.[slug]))
    const missingDependencies = missingModule('dependencies', 'plugins and Composer', capabilities)
    const steps: SiteStep[] = [
      ...['plugin:push', 'composer:push'].map((commandId) => ({commandId, missing: missingDependencies, skipUnused: false, used: !skips.has(commandId)})),
      ...Object.entries(PLUGIN_BACKED).map(([commandId, kind]) => ({
        commandId,
        missing: activatedBy(missingIntegration(kind, capabilities), activatedByPush),
        skipUnused: true,
        used: projectUses(kind, this.localConfig),
      })),
      ...Object.entries(FULL_ONLY).map(([commandId, kind]) => ({
        commandId,
        missing: missingIntegration(kind, capabilities),
        skipUnused: false,
        used: projectUses(kind, this.localConfig),
      })),
      // Without templates, parts or CSS, the step would only write an empty child theme.
      {commandId: 'theme:template:push', missing: missingIntegration('template', capabilities), skipUnused: true, used: projectHasChildThemeFiles(this.localConfig)},
    ]
    this.applySiteSteps(steps, skips, {fromComposer: hasComposerJson, plugins: declaredPlugins})

    const stylesNote = await this.globalStylesSkipNote()
    if (stylesNote) skips.set('theme:style:push', {note: stylesNote, status: 'skipped'})

    return skips
  }
}

// Not missing when one of the plugins that would provide it is activated earlier in the run.
function activatedBy(missing: MissingIntegration | undefined, activatedByPush: string[]): MissingIntegration | undefined {
  return missing?.plugins?.some((slug) => activatedByPush.includes(slug)) ? undefined : missing
}
