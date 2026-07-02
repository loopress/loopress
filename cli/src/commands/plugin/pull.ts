import {Flags} from '@oclif/core'
import got from 'got'

import {LoopressCommand} from '../../lib/base.js'
import {InstalledPlugin} from '../../types/plugin.js'
import {getComposerManagedSlugs, readComposerJson} from '../../utils/composer.js'
import {readLocalConfig, writeLocalConfig} from '../../utils/loopress-config.js'
import {mergePluginManifest} from '../../utils/plugins.js'

export default class Pull extends LoopressCommand {
  static description = 'Pull installed plugins from WordPress into loopress.json'
  static examples = ['$ lps plugin pull', '$ lps plugin pull --dry-run']
  static flags = {
    ...LoopressCommand.baseFlags,
    'dry-run': Flags.boolean({char: 'd', description: 'Show what would be written without making changes'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Pull)
    const dryRun = flags['dry-run']
    const {url} = this.siteConfig

    this.log(`Pulling plugins from ${url}`)

    const headers = await this.buildAuthHeaders()
    const installed: InstalledPlugin[] = await got.get(`${url}/wp-json/loopress/v1/plugins`, {headers}).json()

    const composerJson = await readComposerJson()
    const composerSlugs = composerJson ? getComposerManagedSlugs(composerJson) : []

    const incoming: Record<string, string> = Object.fromEntries(
      installed.filter((p) => !composerSlugs.includes(p.slug)).map((p) => [p.slug, p.version]),
    )

    if (composerSlugs.length > 0) {
      const found = installed.filter((p) => composerSlugs.includes(p.slug)).map((p) => p.slug)
      if (found.length > 0) {
        this.log(`Skipping ${found.length} Composer-managed ${found.length === 1 ? 'plugin' : 'plugins'}: ${found.join(', ')}`)
      }
    }

    const localConfig = await readLocalConfig()
    const {added, merged, updated} = mergePluginManifest(localConfig.plugins ?? {}, incoming)

    if (dryRun) {
      this.log(`[dry-run] Would write ${Object.keys(merged).length} plugins to loopress.json`)
      if (added.length > 0) this.log(`  + ${added.join(', ')}`)
      if (updated.length > 0) {
        for (const u of updated) this.log(`  ~ ${u.slug} (${u.from} → ${u.to})`)
      }

      return
    }

    await writeLocalConfig({...localConfig, plugins: merged})

    this.log(`Wrote ${Object.keys(merged).length} plugins to loopress.json`)
    if (added.length > 0) this.log(`  + Added: ${added.join(', ')}`)
    for (const u of updated) this.log(`  ~ Updated: ${u.slug} ${u.from} → ${u.to}`)

    if (Object.keys(merged).length > 0) {
      await got
        .post(`${url}/wp-json/loopress/v1/plugins/auto-updates/disable`, {
          headers,
          json: {slugs: Object.keys(merged)},
        })
        .json()
    }
  }
}
