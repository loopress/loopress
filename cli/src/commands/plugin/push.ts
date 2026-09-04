import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {isInteractive} from '../../lib/interactive.js'
import {PushCommand} from '../../lib/push-command.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {type InstalledPlugin, type WpNativePlugin} from '../../types/plugin.js'
import {isDowngrade, parseCollisions, SYNC_TIMEOUT_MS, type SyncResponse} from '../../utils/plugin-sync.js'
import {diffPlugins, lockedWpackagistSlugs, parseInstalledPlugins, type PluginDiff} from '../../utils/plugins.js'

type PushResult = {
  activated: string[]
  installed: string[]
  pinned: string[]
  pruned: string[]
  removed: string[]
  status: 'composer-managed' | 'dry-run' | 'in-sync' | 'success'
}

const IN_SYNC: PushResult = {activated: [], installed: [], pinned: [], pruned: [], removed: [], status: 'in-sync'}

export default class Push extends PushCommand {
  static description = 'Install plugins on WordPress to match loopress.json, pinned via Composer + WPackagist'
  static enableJsonFlag = true
  static examples = ['$ lps plugin push', '$ lps plugin push --dry-run', '$ lps plugin push --force --prune']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
    force: Flags.boolean({
      default: false,
      description: 'Allow downgrades and let Loopress take over plugins installed outside it (replaces their files)',
    }),
    prune: Flags.boolean({
      default: false,
      description: 'Deactivate plugins that are active on the site but absent from loopress.json',
    }),
  }

  async run(): Promise<PushResult> {
    const {flags} = await this.parse(Push)
    const {force, prune} = flags

    if (existsSync(join(process.cwd(), this.rootDir, 'composer.json'))) {
      this.warn('This project has a composer.json, which is authoritative for plugins. Run `lps composer push` instead.')
      return {...IN_SYNC, status: 'composer-managed'}
    }

    const manifest = this.localConfig.plugins ?? {}
    if (Object.keys(manifest).length === 0) {
      this.error('No plugins found in loopress.json. Run `lps plugin pull` or `lps plugin add <slug>` first.')
    }

    this.log(`Pushing plugins to ${this.siteConfig.url}`)
    const raw = await this.wp.get<WpNativePlugin[]>('wp/v2/plugins')
    const installed = parseInstalledPlugins(raw)
    const managed = lockedWpackagistSlugs(await this.fetchInstanceLock(), 'plugin')
    const diff = diffPlugins(manifest, installed, managed)

    this.guardForce(diff, force)

    const toPrune = prune ? diff.untrackedActive : []
    // A "latest" pin never shows as drift, but its newest upstream release may have moved
    // since the last push, so a push must still run `composer update` to pick it up.
    const hasLatestPin = Object.values(manifest).includes('latest')
    if (!hasLatestPin && isNoop(diff, toPrune)) {
      this.log('Everything is already in sync.')
      return {...IN_SYNC}
    }

    if (isNoop(diff, toPrune)) this.log('Refreshing plugins pinned to "latest" to their newest releases.')
    logPlan(this, diff, toPrune, force)

    if (this.dryRun) {
      return this.result(diff, {includeCollisions: true, pruned: toPrune, removed: diff.toRemove, status: 'dry-run'})
    }

    await this.confirmRemovals(diff.toRemove)
    const deactivated = await this.deactivateEndangered(installed, diff, force)
    // Plugins that must end up active: the ones we deactivated for the file swap (minus any
    // being uninstalled) plus the ones the manifest wants active but that are inactive today.
    const toReactivate = [...deactivated.filter((p) => !diff.toRemove.includes(p.slug)), ...diff.toActivate]

    let response: SyncResponse
    try {
      response = await this.sync(manifest, force)
    } catch (error) {
      // The file swap never happened, so restore the plugins we defensively deactivated
      // instead of leaving the site with them switched off.
      await this.activate(deactivated.filter((p) => !diff.toRemove.includes(p.slug)))
      throw error
    }

    if (toPrune.length > 0) {
      await this.deactivate(installed.filter((p) => toPrune.includes(p.slug)))
    }

    await this.activate(toReactivate)

    if (response.output.trim()) this.log(response.output.trim())
    this.log('Plugins synced.')
    await this.recordSuccess()

    return this.result(diff, {
      activated: toReactivate.map((p) => p.slug),
      includeCollisions: force,
      pruned: toPrune,
      removed: response.removed ?? diff.toRemove,
      status: 'success',
    })
  }

  private async activate(plugins: Array<{file: string; slug: string}>): Promise<void> {
    for (const plugin of plugins) {
      this.log(`  ⊙ activating ${plugin.slug}`)

      await this.wp.put(`wp/v2/plugins/${plugin.file}`, {status: 'active'})
    }
  }

  private async confirmRemovals(toRemove: string[]): Promise<void> {
    if (toRemove.length === 0 || this.yes || !isInteractive()) return
    const ok = await confirm({default: false, message: `Uninstall ${toRemove.join(', ')} from the site?`})
    if (!ok) this.error('Aborted.')
  }

  private async deactivate(plugins: InstalledPlugin[]): Promise<void> {
    for (const plugin of plugins) {
      this.log(`  ⊘ deactivating ${plugin.slug}`)

      await this.wp.put(`wp/v2/plugins/${plugin.file}`, {status: 'inactive'})
    }
  }

  // Deactivate anything whose folder is about to be deleted or replaced (removed, re-pinned to
  // a new version, or taken over with --force), so the site does not fatal in the window
  // between removal and Composer finishing the install. Returns the plugins it switched off so
  // the caller can switch the still-wanted ones back on.
  private async deactivateEndangered(installed: InstalledPlugin[], diff: PluginDiff, force: boolean): Promise<InstalledPlugin[]> {
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

  private guardForce(diff: PluginDiff, force: boolean): void {
    if (force) return

    if (diff.collisions.length > 0) {
      const list = diff.collisions.map((c) => `${c.slug} (${c.installedVersion})`).join(', ')
      this.error(
        `${diff.collisions.length} plugin(s) are already installed outside Loopress: ${list}. ` +
          'Re-run with --force to let Loopress manage them (this replaces their files with the WPackagist build, ' +
          'local modifications are lost), or remove them from loopress.json.',
      )
    }

    const downgrades = diff.toPin.filter((p) => isDowngrade(p.from, p.to))
    if (downgrades.length > 0) {
      const list = downgrades.map((p) => `${p.slug} ${p.from} to ${p.to}`).join(', ')
      this.error(
        `Refusing to downgrade: ${list}. A downgrade only replaces plugin files, it does not undo database ` +
          'migrations the newer version ran, which can break the site. Re-run with --force, or bump the version in loopress.json.',
      )
    }
  }

  private result(
    diff: PluginDiff,
    opts: {activated?: string[]; includeCollisions: boolean; pruned: string[]; removed: string[]; status: PushResult['status']},
  ): PushResult {
    const collisionSlugs = opts.includeCollisions ? diff.collisions.map((c) => c.slug) : []
    return {
      activated: opts.activated ?? diff.toActivate.map((a) => a.slug),
      installed: [...diff.toInstall.map((a) => a.slug), ...collisionSlugs],
      pinned: diff.toPin.map((p) => p.slug),
      pruned: opts.pruned,
      removed: opts.removed,
      status: opts.status,
    }
  }

  private async sync(manifest: Record<string, string>, force: boolean): Promise<SyncResponse> {
    try {
      return await this.wp.post<SyncResponse>(
        'loopress/v1/composer/sync',
        {force, intent: {plugins: manifest}, lock: null},
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

function isNoop(diff: PluginDiff, toPrune: string[]): boolean {
  return (
    diff.toInstall.length === 0 &&
    diff.toPin.length === 0 &&
    diff.toActivate.length === 0 &&
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

  section('To install', diff.toInstall.map((a) => `+ ${a.slug} ${a.version}`))
  if (force) section('To take over', diff.collisions.map((c) => `! ${c.slug} (installed outside Loopress)`))
  section('To re-pin', diff.toPin.map((p) => `~ ${p.slug} ${p.from} to ${p.to}`))
  section('To activate', diff.toActivate.map((a) => `↑ ${a.slug}`))
  section('To uninstall', diff.toRemove.map((s) => `- ${s}`))
  section('To deactivate (--prune)', prune.map((s) => `⊘ ${s}`))
}
