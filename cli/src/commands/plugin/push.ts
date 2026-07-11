import {Listr} from 'listr2'

import {PushCommand} from '../../lib/push-command.js'
import {WpNativePlugin} from '../../types/plugin.js'
import {getComposerManagedSlugs, readComposerJson} from '../../utils/composer.js'
import {diffPlugins, parseInstalledPlugins} from '../../utils/plugins.js'

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

    const raw = await this.wp.get<WpNativePlugin[]>('wp/v2/plugins')
    const installed = parseInstalledPlugins(raw)

    const {toActivate, toInstall} = diffPlugins(filteredManifest, installed)

    if (toInstall.length === 0 && toActivate.length === 0) {
      this.log('Everything is already in sync.')
      return
    }

    if (toInstall.length > 0) {
      this.log(`\nTo install (${toInstall.length}):`)
      for (const a of toInstall) this.log(`  + ${a.slug}`)
    }

    if (toActivate.length > 0) {
      this.log(`\nTo activate (${toActivate.length}):`)
      for (const a of toActivate) this.log(`  ↑ ${a.slug}`)
    }

    if (this.dryRun) return

    // Installing with `status: active` activates in the same call, so installs never need a
    // separate activation step the way the old custom endpoint's two-step flow did.
    if (toInstall.length > 0) {
      await new Listr(
        toInstall.map((action) => ({
          task: async (_ctx, task) => this.installPlugin(action.slug, task),
          title: `Install ${action.slug}`,
        })),
        {concurrent: false, exitOnError: false},
      ).run()
    }

    if (toActivate.length > 0) {
      await new Listr(
        toActivate.map((action) => ({
          task: async (_ctx, task) => this.activatePlugin(action.file, action.slug, task),
          title: `Activate ${action.slug}`,
        })),
        {concurrent: false, exitOnError: false},
      ).run()
    }

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
  private async activatePlugin(file: string, slug: string, task?: {output: string}): Promise<void> {
    await this.performPluginAction('activate', slug, () => this.wp.put(`wp/v2/plugins/${file}`, {status: 'active'}), task)
  }

  private async installPlugin(slug: string, task?: {output: string}): Promise<void> {
    await this.performPluginAction('install', slug, () => this.wp.post('wp/v2/plugins', {slug, status: 'active'}), task)
  }

  private async performPluginAction(
    verb: 'activate' | 'install',
    slug: string,
    request: () => Promise<unknown>,
    task?: {output: string},
  ): Promise<void> {
    try {
      await request()
      const message = `✓ ${slug} ${verb === 'install' ? 'installed and activated' : 'activated'}`
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
}
