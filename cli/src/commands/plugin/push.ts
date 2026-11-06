import {Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {confirmUninstall} from '../../lib/interactive.js'
import {causeOf, isRecord} from '../../lib/narrow.js'
import {PushCommand} from '../../lib/push-command.js'
import {isLocalEnvironment, isNotFoundError, parseBody, responseOf} from '../../lib/wp-client.js'
import {
  type InstalledPlugin,
  pinActive,
  pinProblem,
  pinVersion,
  pinVersions,
  type PluginManifest,
  type WpNativePlugin,
} from '../../types/plugin.js'
import {parseComposerJson, requireToInstall, toIntent, wpackagistRequire} from '../../utils/composer.js'
import {
  isDowngrade,
  parseCollisions,
  SYNC_TIMEOUT_MS,
  type SyncIntent,
  type SyncResponse,
} from '../../utils/plugin-sync.js'
import {
  diffPlugins,
  lockedWpackagistSlugs,
  parseInstalledPlugins,
  type PluginDiff,
  preferredCopy,
} from '../../utils/plugins.js'
import {isExactVersion} from '../../utils/version.js'

type PushResult = {
  activated: string[]
  deactivated: string[]
  installed: string[]
  pinned: string[]
  pruned: string[]
  removed: string[]
  status: 'dry-run' | 'in-sync' | 'success'
}

const IN_SYNC: PushResult = {
  activated: [],
  deactivated: [],
  installed: [],
  pinned: [],
  pruned: [],
  removed: [],
  status: 'in-sync',
}

type Plugin = {file: string; slug: string}

// Where the wanted plugins come from. A composer.json is authoritative when present, and the
// server always resolves it whole: pushing its plugins pushes its themes and libraries too.
type Source = {
  file: 'composer.json' | 'loopress.json'
  intent: SyncIntent
  manifest: PluginManifest
  packageCount: number
}

export default class Push extends PushCommand {
  static override description =
    'Install WordPress.org plugins on WordPress to match loopress.json (active state included) or composer.json, via Composer + WPackagist'

  static override enableJsonFlag = true
  static override examples = ['$ lps plugin push', '$ lps plugin push --dry-run', '$ lps plugin push --force --prune']
  static override flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
    activate: Flags.boolean({
      default: false,
      description:
        'composer.json projects only: activate every plugin it declares. Without it, plugins keep their current state and new ones stay inactive',
    }),
    force: Flags.boolean({
      default: false,
      description: 'Allow downgrades and let Loopress take over plugins installed outside it (replaces their files)',
    }),
    prune: Flags.boolean({
      default: false,
      description: 'Deactivate plugins that are active on the site but absent from loopress.json (or composer.json)',
    }),
  }

  async run(): Promise<PushResult> {
    const {flags} = await this.parse(Push)
    const {activate, force, prune} = flags
    const source = await this.loadSource(activate)
    const fromComposer = source.file === 'composer.json'

    this.log(`Pushing plugins to ${this.siteConfig.url}`)
    if (fromComposer) {
      this.log(
        `From composer.json, pushed whole (${source.packageCount} packages): themes and libraries it declares are synced too.`,
      )
    }

    const raw = await this.wp.get<WpNativePlugin[]>('wp/v2/plugins')
    const installed = parseInstalledPlugins(raw)
    const managed = lockedWpackagistSlugs(await this.fetchInstanceLock(), 'plugin')
    const diff = diffPlugins(source.manifest, installed, managed)
    // composer.json records no active state: leave inactive plugins alone unless --activate.
    const skippedActivations = fromComposer && !activate ? diff.toActivate : []
    if (fromComposer && !activate) diff.toActivate = []

    this.guardForce(diff, force, source.file)

    const toPrune = prune ? diff.untrackedActive : []
    // A "latest" pin (or a Composer constraint) never shows as drift, but its newest upstream
    // release may have moved since the last push, so a push must still run `composer update`.
    const hasFloatingPin = Object.values(source.manifest).some((pin) => !isExactVersion(pinVersion(pin)))
    if (!hasFloatingPin && isNoop(diff, toPrune)) {
      this.log('Everything is already in sync.')
      this.logStillInactive(skippedActivations)
      // The inventory still matters to the console when nothing had to change.
      if (!this.dryRun) await this.recordDeployment('success')
      return {...IN_SYNC}
    }

    if (isNoop(diff, toPrune)) this.log('Refreshing plugins not pinned to an exact version to their newest releases.')
    logPlan(this, diff, toPrune, force)

    if (this.dryRun) {
      return this.result(diff, {includeCollisions: true, pruned: toPrune, removed: diff.toRemove, status: 'dry-run'})
    }

    if (!(await confirmUninstall(diff.toRemove, this.yes))) this.error('Aborted.')
    const switchedOff = await this.deactivateEndangered(installed, diff, force)
    // Plugins switched off for the file swap come back on, unless loopress.json wants them inactive.
    const deactivated = switchedOff.filter(
      (p) => !diff.toRemove.includes(p.slug) && (fromComposer || pinActive(source.manifest[p.slug])),
    )

    let response: SyncResponse
    try {
      response = await this.sync(source.intent, force)
    } catch (error) {
      // The file swap never happened, so restore the plugins we defensively deactivated
      // instead of leaving the site with them switched off.
      await this.activate(deactivated)
      throw error
    }

    const wasActive = new Set(switchedOff.map((p) => p.slug))
    const activateNew = (slug: string) =>
      fromComposer ? activate || wasActive.has(slug) : pinActive(source.manifest[slug])
    const {newlyInstalled, takenOver} = await this.installedBySync(installed, diff, force)
    const toActivate = [
      ...deactivated.filter((p) => takenOver.every((t) => t.slug !== p.slug)),
      ...diff.toActivate,
      ...[...newlyInstalled, ...takenOver].filter((p) => activateNew(p.slug)),
    ]
    const toDeactivate = [...diff.toDeactivate, ...installed.filter((p) => toPrune.includes(p.slug))]

    await this.deactivate(toDeactivate)
    await this.activate(toActivate)

    if (response.output.trim()) this.log(response.output.trim())
    this.log('Plugins synced.')
    this.logStillInactive([...skippedActivations, ...newlyInstalled.filter((p) => !activateNew(p.slug))], fromComposer)
    await this.recordSuccess()

    return this.result(diff, {
      activated: toActivate.map((p) => p.slug),
      includeCollisions: force,
      pruned: toPrune,
      removed: response.removed ?? diff.toRemove,
      status: 'success',
    })
  }

  // WordPress refuses to activate a plugin whose `Requires Plugins` are inactive, and loopress.json
  // has no dependency order (dokan-lite sorts before woocommerce). A refused plugin is retried
  // after the others, until a round activates nothing.
  private async activate(plugins: Plugin[]): Promise<void> {
    let pending = plugins
    while (pending.length > 0) {
      const blocked: Plugin[] = []
      let missing: string[] = []
      for (const plugin of pending) {
        this.log(`  ⊙ activating ${plugin.slug}`)

        try {
          await this.wp.put(`wp/v2/plugins/${plugin.file}`, {status: 'active'})
        } catch (error) {
          const notInstalled = missingDependencies(error)
          if (!notInstalled) throw error
          blocked.push(plugin)
          missing = [...missing, ...notInstalled]
        }
      }

      if (blocked.length === pending.length) {
        const hint = missing.length > 0 ? ` Not installed: ${[...new Set(missing)].join(', ')}.` : ''
        this.error(
          `Could not activate ${blocked.map((p) => p.slug).join(', ')}: WordPress reports required plugins missing or inactive.${hint} ` +
            'Add them with `lps plugin add <slug>`, then push again.',
        )
      }

      pending = blocked
    }
  }

  private async deactivate(plugins: Plugin[]): Promise<void> {
    for (const plugin of plugins) {
      this.log(`  ⊘ deactivating ${plugin.slug}`)

      await this.wp.put(`wp/v2/plugins/${plugin.file}`, {status: 'inactive'})
    }
  }

  // Deactivate anything whose folder is about to be deleted or replaced (removed, re-pinned to
  // a new version, or taken over with --force), so the site does not fatal in the window
  // between removal and Composer finishing the install. Returns the plugins it switched off so
  // the caller can switch the still-wanted ones back on.
  private async deactivateEndangered(
    installed: InstalledPlugin[],
    diff: PluginDiff,
    force: boolean,
  ): Promise<Plugin[]> {
    const endangered = new Set([
      ...diff.toRemove,
      ...diff.toPin.map((p) => p.slug),
      ...(force ? diff.collisions.map((c) => c.slug) : []),
    ])
    const victims = installed.filter((p) => p.active && endangered.has(p.slug))
    await this.deactivate(victims)
    return victims
  }

  // The site's live composer.lock tells us which plugins Loopress already manages, so the plan
  // can preview removals and tell an unmanaged folder (collision) apart from a re-pin. 404 =
  // nothing pushed yet.
  private async fetchInstanceLock(): Promise<null | string> {
    try {
      const {composerLock} = await this.wp.get<{composerLock: string}>('loopress/v1/composer/lock')
      return composerLock
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  private guardForce(diff: PluginDiff, force: boolean, file: Source['file']): void {
    if (force) return

    if (diff.collisions.length > 0) {
      const list = diff.collisions.map((c) => `${c.slug} (${c.installedVersion})`).join(', ')
      this.error(
        `${diff.collisions.length} plugin(s) are already installed outside Loopress: ${list}. ` +
          'Re-run with --force to let Loopress manage them (this replaces their files with the WPackagist build, ' +
          `local modifications are lost), or remove them from ${file}.`,
      )
    }

    const downgrades = diff.toPin.filter((p) => isDowngrade(p.from, p.to))
    if (downgrades.length > 0) {
      const list = downgrades.map((p) => `${p.slug} ${p.from} to ${p.to}`).join(', ')
      this.error(
        `Refusing to downgrade: ${list}. A downgrade only replaces plugin files, it does not undo database ` +
          `migrations the newer version ran, which can break the site. Re-run with --force, or bump the version in ${file}.`,
      )
    }
  }

  // New and taken-over plugins only get their final WordPress id (folder/main-file) once
  // sync() has installed them: read it from the site. A taken-over plugin is activated from
  // the folder Composer installed, with no stale copy left beside it.
  private async installedBySync(
    installed: InstalledPlugin[],
    diff: PluginDiff,
    force: boolean,
  ): Promise<{newlyInstalled: Plugin[]; takenOver: Plugin[]}> {
    const collisions = force ? diff.collisions.map((c) => c.slug) : []
    if (diff.toInstall.length === 0 && collisions.length === 0) return {newlyInstalled: [], takenOver: []}

    const afterSync = parseInstalledPlugins(await this.wp.get<WpNativePlugin[]>('wp/v2/plugins'))
    const takenOver = filesFor(collisions, afterSync)
    await this.removeStaleCopies(installed, takenOver)
    return {newlyInstalled: filesFor(diff.toInstall.map((p) => p.slug), afterSync), takenOver}
  }

  private async loadSource(activate: boolean): Promise<Source> {
    const composerJsonPath = join(process.cwd(), this.rootDir, 'composer.json')
    if (existsSync(composerJsonPath)) {
      const composerJson = parseComposerJson(await readFile(composerJsonPath, 'utf8'))
      const includeDev = isLocalEnvironment(this.siteConfig.name)
      const manifest = wpackagistRequire(composerJson, 'plugin', includeDev)
      if (Object.keys(manifest).length === 0) {
        this.error(
          'No wpackagist-plugin/* package in composer.json. Run `lps plugin pull` first, or `lps composer push` to push it as is.',
        )
      }

      const require = requireToInstall(composerJson, includeDev)
      return {file: 'composer.json', intent: toIntent(require), manifest, packageCount: Object.keys(require).length}
    }

    if (activate) {
      this.error(
        '--activate only applies to projects with a composer.json: loopress.json already records whether each plugin is active.',
      )
    }

    const manifest = this.localConfig.plugins ?? {}
    if (Object.keys(manifest).length === 0) {
      this.error('No plugins found in loopress.json. Run `lps plugin pull` or `lps plugin add <slug>` first.')
    }

    // A mistyped key (`activate`) would otherwise push the plugin with the default state.
    const problems = Object.entries(manifest).flatMap(([slug, pin]) => pinProblem(slug, pin) ?? [])
    if (problems.length > 0) this.error(`Invalid loopress.json: ${problems.join('; ')}. Fix it, then push again.`)

    return {
      file: 'loopress.json',
      intent: {plugins: pinVersions(manifest)},
      manifest,
      packageCount: Object.keys(manifest).length,
    }
  }

  // composer.json projects: plugins this push left inactive, and how to change that.
  private logStillInactive(plugins: Plugin[], fromComposer = true): void {
    if (!fromComposer || plugins.length === 0) return
    this.log(`${plugins.length} plugin(s) from composer.json are inactive: ${plugins.map((p) => p.slug).join(', ')}.`)
    this.log('Re-run with --activate to activate them, or activate them in wp-admin.')
  }

  // A takeover installs `wp-content/plugins/<slug>/`, but the plugin it replaces may live
  // elsewhere: core's Hello Dolly is `hello.php`, which the site lists under the slug
  // `hello-dolly`. Composer leaves that file in place, and both copies declare the same
  // functions, so activating them together would fatal: delete the stale copy, as --force says.
  private async removeStaleCopies(installed: InstalledPlugin[], managedCopies: Plugin[]): Promise<void> {
    const replaced = installed.flatMap((old) => {
      const copy = managedCopies.find((c) => c.slug === old.slug && c.file !== old.file)
      return copy ? [{copy, old}] : []
    })
    for (const {copy, old} of replaced) {
      this.log(`  ✕ removing ${old.file} (replaced by ${copy.file})`)
      // Deactivated before the sync if it was active (deactivateEndangered): WordPress
      // refuses to delete an active plugin.
      await this.wp.delete(`wp/v2/plugins/${old.file}`)
    }
  }

  private result(
    diff: PluginDiff,
    opts: {
      activated?: string[]
      includeCollisions: boolean
      pruned: string[]
      removed: string[]
      status: PushResult['status']
    },
  ): PushResult {
    const collisionSlugs = opts.includeCollisions ? diff.collisions.map((c) => c.slug) : []
    return {
      activated: opts.activated ?? diff.toActivate.map((a) => a.slug),
      deactivated: diff.toDeactivate.map((a) => a.slug),
      installed: [...diff.toInstall.map((a) => a.slug), ...collisionSlugs],
      pinned: diff.toPin.map((p) => p.slug),
      pruned: opts.pruned,
      removed: opts.removed,
      status: opts.status,
    }
  }

  private async sync(intent: SyncIntent, force: boolean): Promise<SyncResponse> {
    try {
      return await this.wp.post<SyncResponse>(
        'loopress/v1/composer/sync',
        {force, intent, lock: null},
        {timeoutMs: SYNC_TIMEOUT_MS},
      )
    } catch (error) {
      const collisions = parseCollisions(error)
      if (collisions) {
        this.error(
          `The site rejected the push: ${collisions.map((c) => c.slug).join(', ')} installed outside Loopress. Re-run with --force.`,
        )
      }

      throw error
    }
  }
}

// The dependency slugs not installed at all when WordPress refused an activation over unmet
// `Requires Plugins` (empty when they are only inactive), or null for any other error. The REST
// controller adds `{status: 500}` as the error data, which pushes activate_plugin()'s own data
// (`{not_installed, inactive}`) into `additional_data`.
function missingDependencies(error: unknown): null | string[] {
  const body = parseBody(responseOf(causeOf(error)).body)
  if (body.code !== 'plugin_missing_dependencies') return null
  const data = [body.data, ...(Array.isArray(body.additional_data) ? (body.additional_data as unknown[]) : [])]
  return data.flatMap((d) => (isRecord(d) && isRecord(d.not_installed) ? Object.keys(d.not_installed) : []))
}

// The WordPress plugin id of each slug, read after sync() has installed it: a plugin the diff
// saw as missing (or as an unmanaged copy) has no id, or the wrong one, before that.
function filesFor(slugs: string[], installed: InstalledPlugin[]): Plugin[] {
  return slugs.flatMap((slug) => {
    const match = preferredCopy(installed.filter((p) => p.slug === slug), slug)
    return match ? [{file: match.file, slug}] : []
  })
}

function isNoop(diff: PluginDiff, toPrune: string[]): boolean {
  return (
    diff.toInstall.length === 0 &&
    diff.toPin.length === 0 &&
    diff.toActivate.length === 0 &&
    diff.toDeactivate.length === 0 &&
    diff.toRemove.length === 0 &&
    diff.collisions.length === 0 &&
    toPrune.length === 0
  )
}

function logPlan(cmd: Push, diff: PluginDiff, prune: string[], force: boolean): void {
  const section = (label: string, lines: string[]): void => {
    if (lines.length === 0) return
    cmd.log(`\n${label} (${lines.length}):`)
    for (const line of lines) cmd.log(`  ${line}`)
  }

  section(
    'To install',
    diff.toInstall.map((a) => `+ ${a.slug} ${a.version}`),
  )
  if (force)
    section(
      'To take over',
      diff.collisions.map((c) => `! ${c.slug} (installed outside Loopress)`),
    )
  section(
    'To re-pin',
    diff.toPin.map((p) => `~ ${p.slug} ${p.from} to ${p.to}`),
  )
  section(
    'To activate',
    diff.toActivate.map((a) => `↑ ${a.slug}`),
  )
  section(
    'To deactivate',
    diff.toDeactivate.map((a) => `↓ ${a.slug}`),
  )
  section(
    'To uninstall',
    diff.toRemove.map((s) => `- ${s}`),
  )
  section(
    'To deactivate (--prune)',
    prune.map((s) => `⊘ ${s}`),
  )
}
