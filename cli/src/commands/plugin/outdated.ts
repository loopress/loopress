import {LoopressCommand} from '../../lib/base.js'
import {withSpinner} from '../../lib/spinner.js'
import {pinVersion} from '../../types/plugin.js'
import {compareVersions, type VersionJump, versionJump} from '../../utils/version.js'
import {requestPluginInfo} from '../../utils/wporg.js'

export type OutdatedPlugin = {
  current: string
  jump: null | VersionJump
  latest: null | string
  slug: string
  status: 'current' | 'error' | 'outdated' | 'unknown'
}

type OutdatedResult = {outdated: number; plugins: OutdatedPlugin[]}

export default class Outdated extends LoopressCommand {
  static override description = 'Compare the plugins in loopress.json to the latest WordPress.org versions (exits 1 when one is behind or cannot be checked)'
  static override enableJsonFlag = true
  static override examples = ['$ lps plugin outdated', '$ lps plugin outdated --json']
  static override flags = {}

  async run(): Promise<OutdatedResult> {
    const entries = Object.entries(this.localConfig.plugins ?? {})
    if (entries.length === 0) {
      this.log('No plugins in loopress.json.')
      return {outdated: 0, plugins: []}
    }

    const plugins = await withSpinner('Checking plugins', async () =>
      Promise.all(entries.map(async ([slug, pin]) => checkPlugin(slug, pinVersion(pin)))),
    )

    const outdated = plugins.filter((p) => p.status === 'outdated').length
    this.printTable(plugins)
    const failed = plugins.filter((p) => p.status === 'error').length
    if (outdated > 0) this.log(`\n${outdated} plugin(s) behind WordPress.org.`)
    if (failed > 0) this.log(`\n${failed} plugin(s) could not be checked (WordPress.org unreachable).`)
    if (outdated === 0 && failed === 0) this.log('\nAll plugins are up to date.')

    // exit() throws before oclif prints the --json result, which a CI reading it needs most here.
    if (outdated > 0 || failed > 0) {
      if (this.jsonEnabled()) process.exitCode = 1
      else this.exit(1)
    }

    return {outdated, plugins}
  }

  private printTable(plugins: OutdatedPlugin[]): void {
    const rows = [
      ['PLUGIN', 'CURRENT', 'LATEST', 'JUMP'],
      ...plugins.map((p) => [p.slug, p.current, p.latest ?? '-', p.jump ?? (p.status === 'unknown' || p.status === 'error' ? p.status : '-')]),
    ]
    const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => (r[i] ?? '').length)))
    for (const row of rows) this.log(row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ').trimEnd())
  }
}

async function checkPlugin(slug: string, current: string): Promise<OutdatedPlugin> {
  let info: null | Record<string, unknown>
  try {
    info = await requestPluginInfo(slug)
  } catch {
    return {current, jump: null, latest: null, slug, status: 'error'}
  }

  const latest = typeof info?.version === 'string' ? info.version : null
  // Not on WordPress.org (zip, premium), unknown. An unreachable API is an error.
  if (!latest) return {current, jump: null, latest: null, slug, status: 'unknown'}
  // "latest" always installs the newest release: it is never behind.
  const jump = versionJump(current, latest)
  if (jump) return {current, jump, latest, slug, status: 'outdated'}
  // Equal or ahead is current; a pin that can't be ordered at all is unknown.
  const comparable = current === 'latest' || compareVersions(current, latest) !== null
  return {current, jump: null, latest, slug, status: comparable ? 'current' : 'unknown'}
}
