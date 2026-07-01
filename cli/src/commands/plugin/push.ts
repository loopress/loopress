import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import got from 'got'

import {PushCommand} from '../../lib/push-command.js'
import {ActivateResult, InstalledPlugin, InstallResult} from '../../types/plugin.js'
import {getComposerManagedSlugs, readComposerJson} from '../../utils/composer.js'
import {readLocalConfig} from '../../utils/loopress-config.js'
import {diffPlugins} from '../../utils/plugins.js'

export default class Push extends PushCommand {
  static description = 'Sync plugins on WordPress to match loopress.json'
  static examples = ['$ lps plugins push', '$ lps plugins push --dry-run']
  static flags = {
    ...PushCommand.baseFlags,
    'dry-run': Flags.boolean({char: 'd', description: 'Show what would change without making changes'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Push)
    const dryRun = flags['dry-run']
    this.dryRun = dryRun
    const {url} = this.siteConfig

    const localConfig = await readLocalConfig()
    const manifest = localConfig.plugins

    if (!manifest || Object.keys(manifest).length === 0) {
      this.error('No plugins found in loopress.json. Run `lps plugins pull` first.')
    }

    const composerJson = await readComposerJson()
    const composerSlugs = composerJson ? getComposerManagedSlugs(composerJson) : []

    const filteredManifest = Object.fromEntries(
      Object.entries(manifest).filter(([slug]) => !composerSlugs.includes(slug)),
    )

    if (composerSlugs.length > 0) {
      this.log(`Skipping ${composerSlugs.length} Composer-managed ${composerSlugs.length === 1 ? 'plugin' : 'plugins'}: ${composerSlugs.join(', ')}`)
      this.log('Run `lps composer push` to deploy them.')
    }

    this.log(`Pushing plugins to ${url}`)

    const headers = await this.buildAuthHeaders()
    const installed: InstalledPlugin[] = await got.get(`${url}/wp-json/loopress/v1/plugins`, {headers}).json()

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

    if (dryRun) return

    // Install missing plugins and activate them.
    for (const action of toInstall) {
      this.log(`\nInstalling ${action.slug} @ ${action.targetVersion}...`)
      try {
        const result: InstallResult = await got
          .post(`${url}/wp-json/loopress/v1/plugins/install`, {
            headers,
            json: {slug: action.slug, version: action.targetVersion},
          })
          .json()
        this.log(`  ✓ ${result.message}`)
      } catch (error) {
        this.warn(`  Failed to install ${action.slug}: ${(error as Error).message}`)
        continue
      }

      await this.activatePlugin(url, headers, action.slug)
    }

    // Activate installed-but-inactive plugins without prompting.
    for (const action of toActivate) {
      this.log(`\nActivating ${action.slug}...`)
      await this.activatePlugin(url, headers, action.slug)
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
      try {
        const result: InstallResult = await got
          .post(`${url}/wp-json/loopress/v1/plugins/install`, {
            headers,
            json: {slug: action.slug, version: action.targetVersion},
          })
          .json()
        this.log(`  ✓ ${result.message}`)
      } catch (error) {
        this.warn(`  Failed to sync ${action.slug}: ${(error as Error).message}`)
        continue
      }

      await this.activatePlugin(url, headers, action.slug)
    }

    await this.recordSuccess()
  }

  private async activatePlugin(url: string, headers: Record<string, string>, slug: string): Promise<void> {
    try {
      const result: ActivateResult = await got
        .post(`${url}/wp-json/loopress/v1/plugins/activate`, {headers, json: {slug}})
        .json()
      this.log(`  ✓ ${result.message}`)
    } catch (error) {
      this.warn(`  Failed to activate ${slug}: ${(error as Error).message}`)
    }
  }
}
