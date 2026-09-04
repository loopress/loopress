import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {writeLocalConfig} from '../../utils/loopress-config.js'
import {mergePluginManifest} from '../../utils/plugins.js'
import {parseInstalledThemes, type WpNativeTheme} from '../../utils/themes.js'

type PullResult = {
  added: string[]
  merged: Record<string, string>
  status: 'composer-managed' | 'dry-run' | 'success'
  updated: Array<{from: string; slug: string; to: string}>
}

export default class Pull extends LoopressCommand {
  static description = 'Pull installed themes from WordPress into loopress.json, pinned to their live versions'
  static enableJsonFlag = true
  static examples = ['$ lps theme pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<PullResult> {
    const {url} = this.siteConfig

    if (existsSync(join(process.cwd(), this.rootDir, 'composer.json'))) {
      this.warn('This project has a composer.json, which is authoritative. Run `lps composer pull` instead.')
      return {added: [], merged: this.localConfig.themes ?? {}, status: 'composer-managed', updated: []}
    }

    this.log(`Pulling themes from ${url}`)

    const raw = await this.wp.get<WpNativeTheme[]>('wp/v2/themes')
    const installed = parseInstalledThemes(raw)
    const incoming = Object.fromEntries(installed.map((t) => [t.slug, t.version]))

    const {added, merged, updated} = mergePluginManifest(this.localConfig.themes ?? {}, incoming)

    if (this.dryRun) {
      this.log(`[dry-run] Would write ${Object.keys(merged).length} themes to loopress.json`)
      return {added, merged, status: 'dry-run', updated}
    }

    await writeLocalConfig({...this.localConfig, themes: merged})
    this.log(`Wrote ${Object.keys(merged).length} themes to loopress.json`)
    if (added.length > 0) this.log(`  + Added: ${added.join(', ')}`)
    for (const u of updated) this.log(`  ~ Updated: ${u.slug} ${u.from} → ${u.to}`)

    return {added, merged, status: 'success', updated}
  }
}
