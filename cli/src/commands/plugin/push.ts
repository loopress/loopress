import {Listr} from 'listr2'

import {PushCommand} from '../../lib/push-command.js'
import {type WpNativePlugin} from '../../types/plugin.js'
import {getComposerManagedSlugs, readComposerJson} from '../../utils/composer.js'
import {diffPlugins, parseInstalledPlugins, type PluginDiff} from '../../utils/plugins.js'
import {pluralize} from '../../utils/pluralize.js'

type PushResult = {
  activated: string[]
  installed: string[]
  skippedComposerManaged: string[]
  status: 'dry-run' | 'in-sync' | 'success'
}

export default class Push extends PushCommand {
  static description = 'Push plugins to WordPress to match loopress.json'
  static enableJsonFlag = true
  static examples = ['$ lps plugin push', '$ lps plugin push --dry-run']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
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

    const skippedComposerManaged = composerSlugs.filter((slug) => Object.hasOwn(manifest, slug))
    this.logSkippedComposerManaged(skippedComposerManaged)

    this.log(`Pushing plugins to ${url}`)

    const raw = await this.wp.get<WpNativePlugin[]>('wp/v2/plugins')
    const installed = parseInstalledPlugins(raw)

    const {toActivate, toInstall} = diffPlugins(filteredManifest, installed)

    if (toInstall.length === 0 && toActivate.length === 0) {
      this.log('Everything is already in sync.')
      return {activated: [], installed: [], skippedComposerManaged, status: 'in-sync'}
    }

    this.logPlannedChanges(toInstall, toActivate)

    const installedSlugs = toInstall.map((a) => a.slug)
    const activatedSlugs = toActivate.map((a) => a.slug)

    if (this.dryRun) return {activated: activatedSlugs, installed: installedSlugs, skippedComposerManaged, status: 'dry-run'}

    // Installing with `status: active` activates in the same call, so installs never need a
    // separate activation step the way the old custom endpoint's two-step flow did.
    await this.applyPluginChanges(toInstall, toActivate)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'plugin')} failed to install or activate.`)
    }

    await this.recordSuccess()

    return {activated: activatedSlugs, installed: installedSlugs, skippedComposerManaged, status: 'success'}
  }

  private async activatePlugin(file: string, slug: string, task?: {output: string}): Promise<void> {
    await this.performPluginAction('activate', slug, async () => this.wp.put(`wp/v2/plugins/${file}`, {status: 'active'}), task)
  }

  private async applyPluginChanges(toInstall: PluginDiff['toInstall'], toActivate: PluginDiff['toActivate']): Promise<void> {
    if (toInstall.length > 0) {
      await new Listr(
        toInstall.map((action) => ({
          task: async (_ctx, task) => this.installPlugin(action.slug, task),
          title: `Install ${action.slug}`,
        })),
        {concurrent: false, exitOnError: false, renderer: this.jsonEnabled() ? 'silent' : 'default'},
      ).run()
    }

    if (toActivate.length > 0) {
      await new Listr(
        toActivate.map((action) => ({
          task: async (_ctx, task) => this.activatePlugin(action.file, action.slug, task),
          title: `Activate ${action.slug}`,
        })),
        {concurrent: false, exitOnError: false, renderer: this.jsonEnabled() ? 'silent' : 'default'},
      ).run()
    }
  }

  private async installPlugin(slug: string, task?: {output: string}): Promise<void> {
    await this.performPluginAction('install', slug, async () => this.wp.post('wp/v2/plugins', {slug, status: 'active'}), task)
  }

  private logPlannedChanges(toInstall: PluginDiff['toInstall'], toActivate: PluginDiff['toActivate']): void {
    if (toInstall.length > 0) {
      this.log(`\nTo install (${toInstall.length}):`)
      for (const a of toInstall) this.log(`  + ${a.slug}`)
    }

    if (toActivate.length > 0) {
      this.log(`\nTo activate (${toActivate.length}):`)
      for (const a of toActivate) this.log(`  ↑ ${a.slug}`)
    }
  }

  private logSkippedComposerManaged(skippedComposerManaged: string[]): void {
    if (skippedComposerManaged.length === 0) return

    this.log(
      `Skipping ${skippedComposerManaged.length} Composer-managed ${skippedComposerManaged.length === 1 ? 'plugin' : 'plugins'}: ${skippedComposerManaged.join(', ')}`,
    )
    this.log('Run `lps composer push` to deploy them.')
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
      this.reportTaskFailure(`Failed to ${verb} ${slug}: ${(error as Error).message}`, error, task)
    }
  }
}
