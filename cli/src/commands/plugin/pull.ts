import {checkbox} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {isInteractive} from '../../lib/interactive.js'
import {type InstalledPlugin, type PluginManifest, type WpNativePlugin} from '../../types/plugin.js'
import {type ComposerJson, type ComposerPullResult, getComposerManagedSlugs, pullIntoComposerJson} from '../../utils/composer.js'
import {writeLocalConfig} from '../../utils/loopress-config.js'
import {mergePluginManifest, type MergeResult, parseInstalledPlugins} from '../../utils/plugins.js'

type PullResult = MergeResult & {
  skipped?: ComposerPullResult['skipped']
  status: 'dry-run' | 'success'
  // Installed on the site but not tracked by this project (left unticked, or no terminal to ask).
  untracked: string[]
}

export default class Pull extends LoopressCommand {
  static description =
    'Pull installed plugins from WordPress into loopress.json (or composer.json), pinned to their live versions. ' +
    'Plugins already tracked are refreshed; new ones are offered as a list to tick, so plugins that only belong ' +
    'on this environment (cache, security, backups) stay out of the project.'

  static enableJsonFlag = true
  static examples = ['$ lps plugin pull', '$ lps plugin pull --env production --plugin query-monitor']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
    plugin: Flags.string({
      description: 'Start tracking this installed plugin too, without asking (repeatable)',
      multiple: true,
    }),
  }

  async run(): Promise<PullResult> {
    const {flags} = await this.parse(Pull)
    const {url} = this.siteConfig

    this.log(`Pulling plugins from ${url}`)

    const raw = await this.wp.get<WpNativePlugin[]>('wp/v2/plugins')
    const composerJsonPath = join(process.cwd(), this.rootDir, 'composer.json')
    const composerJson = existsSync(composerJsonPath)
      ? (JSON.parse(await readFile(composerJsonPath, 'utf8')) as ComposerJson)
      : undefined
    const declared = new Set(composerJson ? getComposerManagedSlugs(composerJson) : Object.keys(this.localConfig.plugins ?? {}))

    const all = parseInstalledPlugins(raw)
    const selected = await this.selectPlugins(all, declared, flags.plugin ?? [], flags.yes)
    const installed = all.filter((p) => selected.has(p.slug))
    const untracked = all.filter((p) => !selected.has(p.slug)).map((p) => p.slug)
    if (untracked.length > 0) {
      this.log(`  - Not tracked: ${untracked.join(', ')} (add one with \`lps plugin pull --plugin <slug>\`)`)
    }

    // Pin every plugin to the version actually running on the site, and record the inactive ones
    // as such so a later `plugin push` doesn't switch them on. A later `plugin push` installs
    // exactly this set via Composer + WPackagist; drift only surfaces when the pinned version and
    // the live version disagree.
    const versions = Object.fromEntries(installed.map((p) => [p.slug, p.version]))

    // A composer.json is authoritative over loopress.json: pin the live versions there instead.
    if (composerJson) {
      const result = await pullIntoComposerJson(composerJsonPath, 'plugin', versions, {
        dryRun: this.dryRun,
        log: this.log.bind(this),
      })
      return {...result, status: this.dryRun ? 'dry-run' : 'success', untracked}
    }

    const pins: PluginManifest = Object.fromEntries(
      installed.map((p) => [p.slug, p.active ? p.version : {active: false, version: p.version}]),
    )

    const {added, merged, updated} = mergePluginManifest(this.localConfig.plugins ?? {}, pins)

    if (this.dryRun) {
      this.log(`[dry-run] Would write ${Object.keys(merged).length} plugins to loopress.json`)
      if (added.length > 0) this.log(`  + ${added.join(', ')}`)
      for (const u of updated) this.log(`  ~ ${u.slug} (${u.from} → ${u.to})`)

      return {added, merged, status: 'dry-run', untracked, updated}
    }

    await writeLocalConfig({...this.localConfig, plugins: merged})

    this.log(`Wrote ${Object.keys(merged).length} plugins to loopress.json`)
    if (added.length > 0) this.log(`  + Added: ${added.join(', ')}`)
    for (const u of updated) this.log(`  ~ Updated: ${u.slug} ${u.from} → ${u.to}`)

    return {added, merged, status: 'success', untracked, updated}
  }

  // Plugins already tracked are always refreshed, plus any --plugin. Every other installed plugin
  // is offered unticked, so a second pull from production never brings Wordfence back on its
  // own. With nobody to ask (--yes, --json, CI, the MCP server), only those two sets count:
  // "track everything" would bring the same problem back silently.
  private async selectPlugins(
    installed: InstalledPlugin[],
    declared: Set<string>,
    requested: string[],
    yes: boolean,
  ): Promise<Set<string>> {
    const slugs = new Set(installed.map((p) => p.slug))
    for (const slug of requested) {
      if (!slugs.has(slug)) this.warn(`--plugin ${slug}: not installed on this environment, skipped.`)
    }

    const selected = new Set([...slugs].filter((slug) => declared.has(slug) || requested.includes(slug)))
    const candidates = installed.filter((p) => !selected.has(p.slug))
    if (yes || candidates.length === 0 || this.jsonEnabled() || !isInteractive()) return selected

    const picked = await checkbox({
      choices: candidates.map((p) => ({name: `${p.slug} ${p.version}${p.active ? '' : ' (inactive)'}`, value: p.slug})),
      message: 'Which of these plugins should the project track? Leave the ones that only belong on this environment unticked.',
    })
    for (const slug of picked) selected.add(slug)

    return selected
  }
}
