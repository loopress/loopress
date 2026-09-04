import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {type WpNativePlugin} from '../../types/plugin.js'
import {writeLocalConfig} from '../../utils/loopress-config.js'
import {mergePluginManifest, type MergeResult, parseInstalledPlugins} from '../../utils/plugins.js'

type PullResult = MergeResult & {
  status: 'composer-managed' | 'dry-run' | 'success'
}

export default class Pull extends LoopressCommand {
  static description = 'Pull installed plugins from WordPress into loopress.json, pinned to their live versions'
  static enableJsonFlag = true
  static examples = ['$ lps plugin pull', '$ lps plugin pull --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<PullResult> {
    const {url} = this.siteConfig

    if (existsSync(join(process.cwd(), this.rootDir, 'composer.json'))) {
      this.warn('This project has a composer.json, which is authoritative for plugins. Run `lps composer pull` instead.')
      return {added: [], merged: this.localConfig.plugins ?? {}, status: 'composer-managed', updated: []}
    }

    this.log(`Pulling plugins from ${url}`)

    const raw = await this.wp.get<WpNativePlugin[]>('wp/v2/plugins')
    const installed = parseInstalledPlugins(raw)

    // Pin every plugin to the version actually running on the site. A later `plugin push`
    // installs exactly this set via Composer + WPackagist; drift only surfaces when the pinned
    // version and the live version disagree.
    const incoming: Record<string, string> = Object.fromEntries(installed.map((p) => [p.slug, p.version]))

    const {added, merged, updated} = mergePluginManifest(this.localConfig.plugins ?? {}, incoming)

    if (this.dryRun) {
      this.log(`[dry-run] Would write ${Object.keys(merged).length} plugins to loopress.json`)
      if (added.length > 0) this.log(`  + ${added.join(', ')}`)
      for (const u of updated) this.log(`  ~ ${u.slug} (${u.from} → ${u.to})`)

      return {added, merged, status: 'dry-run', updated}
    }

    await writeLocalConfig({...this.localConfig, plugins: merged})

    this.log(`Wrote ${Object.keys(merged).length} plugins to loopress.json`)
    if (added.length > 0) this.log(`  + Added: ${added.join(', ')}`)
    for (const u of updated) this.log(`  ~ Updated: ${u.slug} ${u.from} → ${u.to}`)

    return {added, merged, status: 'success', updated}
  }
}
