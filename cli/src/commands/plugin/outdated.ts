import {LoopressCommand} from '../../lib/base.js'
import {withSpinner} from '../../lib/spinner.js'
import {pinVersion} from '../../types/plugin.js'
import {compareVersions, type VersionJump, versionJump} from '../../utils/version.js'
import {fetchPluginInfo} from '../../utils/wporg.js'

export type OutdatedPlugin = {
  current: string
  jump: null | VersionJump
  latest: null | string
  slug: string
  status: 'current' | 'outdated' | 'unknown'
}

type OutdatedResult = {outdated: number; plugins: OutdatedPlugin[]}

export default class Outdated extends LoopressCommand {
  static override description = 'Compare the plugins in loopress.json to the latest WordPress.org versions (exits 1 when one is behind)'
  static override enableJsonFlag = true
  static override examples = ['$ lps plugin outdated', '$ lps plugin outdated --json']
  static override flags = {}

  async run(): Promise<OutdatedResult> {
    const entries = Object.entries(this.localConfig.plugins ?? {})
    if (entries.length === 0) {
      this.log('No plugins in loopress.json.')
      return {outdated: 0, plugins: []}
    }

    const plugins: OutdatedPlugin[] = []
    for (const [slug, pin] of entries) {
      plugins.push(await withSpinner(`Checking ${slug}`, async () => checkPlugin(slug, pinVersion(pin))))
    }

    const outdated = plugins.filter((p) => p.status === 'outdated').length
    this.printTable(plugins)
    this.log(outdated === 0 ? '\nAll plugins are up to date.' : `\n${outdated} plugin(s) behind WordPress.org.`)

    // exit() throws before oclif prints the --json result, which a CI reading it needs most here.
    if (outdated > 0) {
      if (this.jsonEnabled()) process.exitCode = 1
      else this.exit(1)
    }

    return {outdated, plugins}
  }

  private printTable(plugins: OutdatedPlugin[]): void {
    const rows = [
      ['PLUGIN', 'CURRENT', 'LATEST', 'JUMP'],
      ...plugins.map((p) => [p.slug, p.current, p.latest ?? '-', p.jump ?? (p.status === 'unknown' ? 'unknown' : '-')]),
    ]
    const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => (r[i] ?? '').length)))
    for (const row of rows) this.log(row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ').trimEnd())
  }
}

async function checkPlugin(slug: string, current: string): Promise<OutdatedPlugin> {
  const info = await fetchPluginInfo(slug)
  const latest = typeof info?.version === 'string' ? info.version : null
  // Not on WordPress.org (zip, premium), or the API is unreachable: unknown, never an error.
  if (!latest) return {current, jump: null, latest: null, slug, status: 'unknown'}
  // "latest" always installs the newest release: it is never behind.
  const jump = versionJump(current, latest)
  if (jump) return {current, jump, latest, slug, status: 'outdated'}
  // Equal or ahead is current; a pin that can't be ordered at all is unknown.
  const comparable = current === 'latest' || compareVersions(current, latest) !== null
  return {current, jump: null, latest, slug, status: comparable ? 'current' : 'unknown'}
}
