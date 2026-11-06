import {Args, Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {withSpinner} from '../../lib/spinner.js'
import {pinVersion} from '../../types/plugin.js'
import {writeLocalConfig} from '../../utils/loopress-config.js'
import {compareVersions, isExactVersion, type VersionJump, versionJump} from '../../utils/version.js'
import {requestPluginInfo} from '../../utils/wporg.js'

export type PluginChange = {from: string; jump: VersionJump; slug: string; to: string}

export type SkippedPlugin = {
  // current: nothing newer within the cap; latest: the pin already tracks every release;
  // unknown: not on WordPress.org or not an orderable version; error: WordPress.org unreachable.
  reason: 'current' | 'error' | 'latest' | 'unknown'
  slug: string
  version: string
}

type UpdateResult = {changes: PluginChange[]; skipped: SkippedPlugin[]}

type Cap = 'minor' | 'patch' | undefined

export default class Update extends LoopressCommand {
  static override args = {
    slug: Args.string({description: 'Plugin slug(s) in loopress.json to update (default: all of them)'}),
  }

  static override description =
    'Rewrite plugin versions in loopress.json to the latest WordPress.org releases (loopress.json only, run `lps plugin push` to apply)'

  static override enableJsonFlag = true
  static override examples = [
    '$ lps plugin update',
    '$ lps plugin update woocommerce akismet',
    '$ lps plugin update --minor',
    '$ lps plugin update --patch --json',
  ]

  static override flags = {
    ...LoopressCommand.dryRunFlag,
    minor: Flags.boolean({description: 'Stay on the current major version (minor and patch releases only)', exclusive: ['patch']}),
    patch: Flags.boolean({description: 'Stay on the current minor version (patch releases only)', exclusive: ['minor']}),
  }

  static override strict = false

  async run(): Promise<UpdateResult> {
    const {argv, flags} = await this.parse(Update)
    const pins = this.localConfig.plugins ?? {}
    const requested = [...new Set(argv.map(String))]
    const missing = requested.filter((slug) => !Object.hasOwn(pins, slug))
    if (missing.length > 0) this.error(`Not in loopress.json: ${missing.join(', ')}. Add it with \`lps plugin add\`.`)

    const targets = Object.entries(pins).filter(([slug]) => requested.length === 0 || requested.includes(slug))
    if (targets.length === 0) {
      this.log('No plugins in loopress.json.')
      return {changes: [], skipped: []}
    }

    const results = await withSpinner('Checking plugins', async () =>
      Promise.all(targets.map(async ([slug, pin]) => resolveUpdate(slug, pinVersion(pin), capOf(flags)))),
    )
    const changes = results.filter((r): r is PluginChange => 'to' in r)
    const skipped = results.filter((r): r is SkippedPlugin => 'reason' in r)

    for (const c of changes) this.log(`${this.dryRun ? '[dry-run] ' : ''}${c.slug}  ${c.from} -> ${c.to}  (${c.jump})`)
    if (changes.length === 0) this.log('Every plugin is already at the newest version allowed.')
    else if (!this.dryRun) await this.write(changes)

    const failed = skipped.filter((s) => s.reason === 'error').map((s) => s.slug)
    if (failed.length > 0) {
      this.warn(`Could not check ${failed.join(', ')} (WordPress.org unreachable).`)
      // Same as `plugin outdated`: exit() would throw before oclif prints the --json result.
      if (this.jsonEnabled()) process.exitCode = 1
      else this.exit(1)
    }

    return {changes, skipped}
  }

  private async write(changes: PluginChange[]): Promise<void> {
    const plugins = {...this.localConfig.plugins}
    for (const {slug, to} of changes) {
      const pin = plugins[slug]
      // An object pin keeps its other keys (an inactive plugin stays inactive).
      plugins[slug] = typeof pin === 'object' ? {...pin, version: to} : to
    }

    await writeLocalConfig({...this.localConfig, plugins})
    this.log(`\nUpdated ${changes.length} plugin(s) in loopress.json. Run \`lps plugin push\` to apply.`)
  }
}

function capOf(flags: {minor: boolean; patch: boolean}): Cap {
  if (flags.patch) return 'patch'
  return flags.minor ? 'minor' : undefined
}

async function resolveUpdate(slug: string, current: string, cap: Cap): Promise<PluginChange | SkippedPlugin> {
  if (current === 'latest') return {reason: 'latest', slug, version: current}

  let info: null | Record<string, unknown>
  try {
    info = await requestPluginInfo(slug, {versions: cap !== undefined})
  } catch {
    return {reason: 'error', slug, version: current}
  }

  const latest = typeof info?.version === 'string' ? info.version : null
  if (!latest || compareVersions(current, latest) === null) return {reason: 'unknown', slug, version: current}

  const to = pickUpdate(current, latest, info?.versions, cap)
  const jump = to ? versionJump(current, to) : null
  return to && jump ? {from: current, jump, slug, to} : {reason: 'current', slug, version: current}
}

// The version `current` should move to: `latest` without a cap, otherwise the newest stable
// release from WordPress.org's version list that keeps the major (--minor) or the major and
// minor (--patch). Null when nothing newer qualifies.
export function pickUpdate(current: string, latest: string, versions: unknown, cap: Cap): null | string {
  if (cap === undefined) return versionJump(current, latest) ? latest : null

  const listed = typeof versions === 'object' && versions !== null ? Object.keys(versions) : []
  let best: null | string = null
  for (const candidate of [...listed, latest]) {
    // Skips "trunk", prereleases and anything beyond the advertised latest release.
    if (!/^\d+(?:\.\d+){0,3}$/.test(candidate) || !isExactVersion(candidate)) continue
    if ((compareVersions(candidate, latest) ?? 1) > 0) continue
    const jump = versionJump(current, candidate)
    if (!jump || jump === 'major' || (cap === 'patch' && jump === 'minor')) continue
    if (best === null || (compareVersions(candidate, best) ?? 0) > 0) best = candidate
  }

  return best
}
