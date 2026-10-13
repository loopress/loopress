import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {LoopressCommand} from '../../../lib/base.js'
import {type ComposerPullResult, pullIntoComposerJson} from '../../../utils/composer.js'
import {writeLocalConfig} from '../../../utils/loopress-config.js'
import {mergePluginManifest} from '../../../utils/plugins.js'
import {parseInstalledThemes, type WpNativeTheme} from '../../../utils/themes.js'

type PullResult = {
  added: string[]
  merged: Record<string, string>
  skipped?: ComposerPullResult['skipped']
  status: 'dry-run' | 'success'
  updated: Array<{from: string; slug: string; to: string}>
}

export default class Pull extends LoopressCommand {
  static description = 'Pull installed themes from WordPress into loopress.json, pinned to their live versions'
  static enableJsonFlag = true
  static examples = ['$ lps theme version pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<PullResult> {
    const {url} = this.siteConfig

    this.log(`Pulling themes from ${url}`)

    const raw = await this.wp.get<WpNativeTheme[]>('wp/v2/themes')
    // A theme with no Version header can't be pinned, and `theme version push` would then fail on
    // it: the Loopress child theme (`<parent>-loopress`, written by `theme template push`) is one.
    const installed = parseInstalledThemes(raw)
    const unversioned = installed.filter((t) => t.version === '').map((t) => t.slug)
    const incoming = Object.fromEntries(installed.filter((t) => t.version !== '').map((t) => [t.slug, t.version]))
    if (unversioned.length > 0) this.log(`  - Skipped: ${unversioned.join(', ')} (no version to pin)`)

    // A composer.json is authoritative over loopress.json: pin the live versions there instead.
    const composerJsonPath = join(process.cwd(), this.rootDir, 'composer.json')
    if (existsSync(composerJsonPath)) {
      const result = await pullIntoComposerJson(composerJsonPath, 'theme', incoming, {
        dryRun: this.dryRun,
        log: this.log.bind(this),
      })
      return {...result, status: this.dryRun ? 'dry-run' : 'success'}
    }

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
