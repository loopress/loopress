import {confirm} from '@inquirer/prompts'
import {Listr} from 'listr2'

import {PushCommand} from '../../lib/push-command.js'
import {ActivateResult, InstalledPlugin, InstallResult} from '../../types/plugin.js'
import {getComposerManagedSlugs, readComposerJson} from '../../utils/composer.js'
import {diffPlugins, PluginDiff} from '../../utils/plugins.js'

export default class Push extends PushCommand {
  static description = 'Push plugins to WordPress to match loopress.json'
  static examples = ['$ lps plugin push', '$ lps plugin push --dry-run']
  static flags = {
    ...PushCommand.dryRunFlag,
  }
  private failedCount = 0

  async run(): Promise<void> {
    const {url} = this.siteConfig

    const manifest = this.localConfig.plugins

    if (!manifest || Object.keys(manifest).length === 0) {
      this.error('No plugins found in loopress.json. Run `lps plugin pull` first.')
    }

    const composerJson = await readComposerJson()
    const composerSlugs = composerJson ? getComposerManagedSlugs(composerJson) : []

    const filteredManifest = Object.fromEntries(
      Object.entries(manifest).filter(([slug]) => !composerSlugs.includes(slug)),
    )

    const skipped = composerSlugs.filter((slug) => slug in manifest)
    if (skipped.length > 0) {
      this.log(`Skipping ${skipped.length} Composer-managed ${skipped.length === 1 ? 'plugin' : 'plugins'}: ${skipped.join(', ')}`)
      this.log('Run `lps composer push` to deploy them.')
    }

    this.log(`Pushing plugins to ${url}`)

    const installed = await this.wp.get<InstalledPlugin[]>('loopress/v1/plugins')

    const {drifted, toActivate, toInstall} = diffPlugins(filteredManifest, installed)

    if (toInstall.length === 0 && toActivate.length === 0 && drifted.length === 0) {
      this.log('Everything is already in sync.')
      return
    }

    if (toInstall.length > 0) {
      this.log(`\nTo install (${toInstall.length}):`)
      for (const a of toInstall) this.log(`  + ${a.slug} @ ${a.targetVersion}`)
    }

    if (toActivate.length > 0) {
      this.log(`\nTo activate (${toActivate.length}):`)
      for (const a of toActivate) this.log(`  ↑ ${a.slug}`)
    }

    if (drifted.length > 0) {
      this.log(`\nVersion mismatch (${drifted.length}):`)
      for (const a of drifted) {
        this.log(`  ~ ${a.slug}: site has ${a.currentVersion}, manifest wants ${a.targetVersion}`)
      }
    }

    if (this.dryRun) return

    // Install missing plugins and activate them.
    if (toInstall.length > 0) {
      await new Listr(
        toInstall.map((action) => ({
          task: async (_ctx, task) => this.installAndActivate(action.slug, action.targetVersion, task),
          title: `Install ${action.slug} @ ${action.targetVersion}`,
        })),
        {concurrent: false, exitOnError: false},
      ).run()
    }

    // Activate installed-but-inactive plugins without prompting.
    if (toActivate.length > 0) {
      await new Listr(
        toActivate.map((action) => ({
          task: async (_ctx, task) => this.activatePlugin(action.slug, task),
          title: `Activate ${action.slug}`,
        })),
        {concurrent: false, exitOnError: false},
      ).run()
    }

    await this.syncDrifted(drifted)

    if (this.failedCount > 0) {
      this.error(`${this.failedCount} plugin${this.failedCount === 1 ? '' : 's'} failed to install or activate.`)
    }

    await this.recordSuccess()
  }

  // `task` is only passed when called from within a running Listr task list (see `run()`); it lets
  // status lines go through `task.output` instead of `this.log`/`this.warn`, which would otherwise
  // race with the renderer repainting the terminal. Called without `task` (e.g. directly in tests),
  // it falls back to plain logging. Rethrowing on failure (rather than swallowing) is what lets Listr
  // mark the task as failed (red cross) instead of completed, even though `exitOnError: false` stops
  // that failure from aborting sibling tasks in the same list.
  private async activatePlugin(slug: string, task?: {output: string}): Promise<void> {
    await this.performPluginAction<ActivateResult>('activate', {body: {slug}, endpoint: 'loopress/v1/plugins/activate', slug}, task)
  }

  private async installAndActivate(slug: string, version: string, task?: {output: string}): Promise<void> {
    await this.performPluginAction<InstallResult>('install', {body: {slug, version}, endpoint: 'loopress/v1/plugins/install', slug}, task)
    await this.activatePlugin(slug, task)
  }

  private async performPluginAction<T extends {message: string}>(
    verb: 'activate' | 'install',
    request: {body: Record<string, unknown>; endpoint: string; slug: string},
    task?: {output: string},
  ): Promise<void> {
    const {body, endpoint, slug} = request
    try {
      const result = await this.wp.post<T>(endpoint, body)
      const message = `✓ ${result.message}`
      if (task) task.output = message
      else this.log(`  ${message}`)
    } catch (error) {
      const message = `Failed to ${verb} ${slug}: ${(error as Error).message}`
      if (task) task.output = message
      else this.warn(`  ${message}`)
      this.failedCount++
      throw error
    }
  }

  // Prompt per drifted plugin before syncing. Prompts run sequentially on plain stdout,
  // before the Listr renderer takes over the terminal for the confirmed subset.
  private async syncDrifted(drifted: PluginDiff['drifted']): Promise<void> {
    const confirmedDrift: typeof drifted = []
    for (const action of drifted) {
      const proceed = await confirm({
        default: false,
        message: `${action.slug} is at ${action.currentVersion} on the site but manifest wants ${action.targetVersion}. Sync to ${action.targetVersion}?`,
      })

      if (proceed) {
        confirmedDrift.push(action)
      } else {
        this.log(`  Skipped ${action.slug}`)
      }
    }

    if (confirmedDrift.length === 0) return

    await new Listr(
      confirmedDrift.map((action) => ({
        task: async (_ctx, task) => this.installAndActivate(action.slug, action.targetVersion, task),
        title: `Sync ${action.slug} to ${action.targetVersion}`,
      })),
      {concurrent: false, exitOnError: false},
    ).run()
  }
}
