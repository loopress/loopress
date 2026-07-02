import {confirm} from '@inquirer/prompts'

import {PushCommand} from '../../lib/push-command.js'
import {ActivateResult, InstalledPlugin, InstallResult} from '../../types/plugin.js'
import {getComposerManagedSlugs, readComposerJson} from '../../utils/composer.js'
import {diffPlugins} from '../../utils/plugins.js'

export default class Push extends PushCommand {
  static description = 'Push plugins to WordPress to match loopress.json'
  static examples = ['$ lps plugin push', '$ lps plugin push --dry-run']
  static flags = {
    ...PushCommand.baseFlags,
    ...PushCommand.dryRunFlag,
  }

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
    for (const action of toInstall) {
      this.log(`\nInstalling ${action.slug} @ ${action.targetVersion}...`)
      await this.installAndActivate(action.slug, action.targetVersion)
    }

    // Activate installed-but-inactive plugins without prompting.
    for (const action of toActivate) {
      this.log(`\nActivating ${action.slug}...`)
      await this.activatePlugin(action.slug)
    }

    // Prompt per drifted plugin before syncing.
    for (const action of drifted) {
      this.log('')
      const proceed = await confirm({
        default: false,
        message: `${action.slug} is at ${action.currentVersion} on the site but manifest wants ${action.targetVersion}. Sync to ${action.targetVersion}?`,
      })

      if (!proceed) {
        this.log(`  Skipped ${action.slug}`)
        continue
      }

      this.log(`  Syncing ${action.slug} to ${action.targetVersion}...`)
      await this.installAndActivate(action.slug, action.targetVersion)
    }

    await this.recordSuccess()
  }

  private async activatePlugin(slug: string): Promise<void> {
    try {
      const result = await this.wp.post<ActivateResult>('loopress/v1/plugins/activate', {slug})
      this.log(`  ✓ ${result.message}`)
    } catch (error) {
      this.warn(`  Failed to activate ${slug}: ${(error as Error).message}`)
    }
  }

  private async installAndActivate(slug: string, version: string): Promise<void> {
    try {
      const result = await this.wp.post<InstallResult>('loopress/v1/plugins/install', {slug, version})
      this.log(`  ✓ ${result.message}`)
    } catch (error) {
      this.warn(`  Failed to install ${slug}: ${(error as Error).message}`)
      return
    }

    await this.activatePlugin(slug)
  }
}
