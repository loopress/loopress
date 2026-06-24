import {Flags} from '@oclif/core'
import got from 'got'

import {LoopressCommand} from '../../lib/base.js'
import {InstalledPlugin} from '../../types/plugin.js'
import {readLocalConfig, writeLocalConfig} from '../../utils/loopress-config.js'

export default class Pull extends LoopressCommand {
  static description = 'Pull installed plugins from WordPress into loopress.config.js'
  static examples = [
    '$ lps plugins pull',
    '$ lps plugins pull --dry-run',
  ]
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
    const installed: InstalledPlugin[] = await got
      .get(`${url}/wp-json/loopress/v1/plugins`, {headers})
      .json()

    const incoming: Record<string, string> = {}
    for (const plugin of installed) {
      incoming[plugin.slug] = plugin.version
    }

    const localConfig = await readLocalConfig()
    const existing = localConfig.plugins ?? {}
    const merged = {...existing, ...incoming}

    const added = Object.keys(incoming).filter((s) => !(s in existing))
    const updated = Object.keys(incoming).filter(
      (s) => s in existing && existing[s] !== incoming[s],
    )

    if (dryRun) {
      this.log(`[dry-run] Would write ${Object.keys(merged).length} plugins to loopress.config.js`)
      if (added.length > 0) this.log(`  + ${added.join(', ')}`)
      if (updated.length > 0) this.log(`  ~ ${updated.map((s) => `${s} (${existing[s]} → ${incoming[s]})`).join(', ')}`)
      return
    }

    await writeLocalConfig({...localConfig, plugins: merged})

    this.log(`Wrote ${Object.keys(merged).length} plugins to loopress.config.js`)
    if (added.length > 0) this.log(`  + Added: ${added.join(', ')}`)
    if (updated.length > 0) {
      for (const slug of updated) {
        this.log(`  ~ Updated: ${slug} ${existing[slug]} → ${incoming[slug]}`)
      }
    }

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
