import got from 'got'

import {LoopressCommand} from '../../lib/base.js'
import {compareVersions} from '../../utils/version.js'

type Advisory = {
  cve?: string
  fixedIn?: string
  score?: number
  severity?: string
  slug: string
  title: string
}

type HealthNote = {
  message: string
  slug: string
}

type AuditResult = {
  advisories: Advisory[]
  health: HealthNote[]
  status: 'clean' | 'issues'
}

const WPVULN_BASE = 'https://www.wpvulnerability.net/plugin'
const WPORG_INFO = 'https://api.wordpress.org/plugins/info/1.2/'

export default class Audit extends LoopressCommand {
  static description = 'Check the plugins in loopress.json for known vulnerabilities and health issues'
  static enableJsonFlag = true
  static examples = ['$ lps plugin audit']
  static flags = {}

  async run(): Promise<AuditResult> {
    const manifest = {...this.localConfig.plugins}
    const slugs = Object.keys(manifest)

    if (slugs.length === 0) {
      this.log('No plugins in loopress.json to audit.')
      return {advisories: [], health: [], status: 'clean'}
    }

    const advisories: Advisory[] = []
    const health: HealthNote[] = []
    for (const slug of slugs) {
       
      const found = await this.auditOne(slug, manifest[slug])
      advisories.push(...found.advisories)
      health.push(...found.health)
    }

    return this.report(advisories, health, slugs.length)
  }

  private async auditOne(slug: string, pinned: string): Promise<{advisories: Advisory[]; health: HealthNote[]}> {
    const [vulns, info] = await Promise.all([this.fetchVulnerabilities(slug), this.fetchHealth(slug)])
    const advisories = vulns
      .filter((v) => pinned === 'latest' || affects(pinned, v.fixedIn))
      .map((v) => ({...v, slug}))
    const health = info ? describeHealth(slug, pinned, info) : []
    return {advisories, health}
  }

  private async fetchHealth(slug: string): Promise<null | Record<string, unknown>> {
    try {
      const body = await got(WPORG_INFO, {
        searchParams: {'action': 'plugin_information', 'request[slug]': slug},
        timeout: {request: 10_000},
      }).json<Record<string, unknown>>()
      return typeof body === 'object' && !('error' in body) ? body : null
    } catch {
      return null
    }
  }

  private async fetchVulnerabilities(slug: string): Promise<Array<Omit<Advisory, 'slug'>>> {
    let body: {data?: {vulnerability?: unknown[]}}
    try {
      body = await got(`${WPVULN_BASE}/${encodeURIComponent(slug)}/`, {
        timeout: {request: 10_000},
      }).json<{data?: {vulnerability?: unknown[]}}>()
    } catch (error) {
      // Never swallow this into an empty list: a clean audit must mean "no advisories found",
      // not "the advisory service was unreachable". Fail the command instead.
      throw new Error(
        `Could not reach the vulnerability database (wpvulnerability.net) for "${slug}": ${(error as Error).message}. ` +
          'Audit aborted so a service outage is not reported as a clean result.',
        {cause: error},
      )
    }

    const list = Array.isArray(body?.data?.vulnerability) ? body.data.vulnerability : []
    return list.map((raw) => normalizeAdvisory(raw as Record<string, unknown>))
  }

  private report(advisories: Advisory[], health: HealthNote[], count: number): AuditResult {
    if (advisories.length === 0 && health.length === 0) {
      this.log(`No known vulnerabilities or health issues for ${count} plugin(s).`)
      return {advisories, health, status: 'clean'}
    }

    for (const a of advisories) this.log(`  ⚠ ${a.slug}: ${a.title}${advisoryMeta(a)}`)
    for (const h of health) this.log(`  · ${h.slug}: ${h.message}`)

    const noun = advisories.length === 1 ? 'advisory' : 'advisories'
    this.log(
      `\n${advisories.length} vulnerability ${noun}, ${health.length} health note(s). ` +
        'Vulnerability data: wpvulnerability.net.',
    )

    if (advisories.length > 0) this.exit(1)
    return {advisories, health, status: 'issues'}
  }
}

function advisoryMeta(a: Advisory): string {
  const fixed = a.fixedIn ? `fixed in ${a.fixedIn}` : undefined
  const parts = [a.severity, a.cve, fixed].filter(Boolean)
  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

function normalizeAdvisory(raw: Record<string, unknown>): Omit<Advisory, 'slug'> {
  const cvss = (raw.cvss ?? {}) as {score?: number; severity?: string}
  const source = Array.isArray(raw.source) ? (raw.source as Array<{id?: string}>) : []
  const cve = typeof raw.cve === 'string' ? raw.cve : source.find((s) => s.id?.startsWith('CVE-'))?.id

  return {
    cve,
    fixedIn: extractFixedIn(raw),
    score: cvss.score,
    severity: cvss.severity,
    title: typeof raw.name === 'string' ? raw.name : 'Unnamed advisory',
  }
}

// wpvulnerability's `impact.software[].versions[]` carries `to_version` / `to_compare`; the
// first "< X" bound is the version the fix landed in. Best-effort: the shape varies, so a
// missing bound just means we can't tell and the advisory is reported anyway.
function extractFixedIn(raw: Record<string, unknown>): string | undefined {
  const impact = raw.impact as undefined | {software?: Array<{versions?: Array<{to_compare?: string; to_version?: string}>}>}
  for (const sw of impact?.software ?? []) {
    for (const v of sw.versions ?? []) {
      if (v.to_compare === '<' && typeof v.to_version === 'string') return v.to_version
    }
  }

  return undefined
}

// If we know the fix version, a pin below it is affected. If we can't compare (odd version
// strings), report it anyway: a false positive is safer than hiding an advisory.
function affects(pinned: string, fixedIn: string | undefined): boolean {
  if (!fixedIn) return true
  const order = compareVersions(pinned, fixedIn)
  return order === null || order < 0
}

function describeHealth(slug: string, pinned: string, info: Record<string, unknown>): HealthNote[] {
  const notes: HealthNote[] = []

  if (info.closed === true) {
    notes.push({message: 'removed from the WordPress.org directory', slug})
  }

  const requiresPhp = typeof info.requires_php === 'string' ? info.requires_php : null
  if (requiresPhp) notes.push({message: `requires PHP ${requiresPhp}`, slug})

  const latest = typeof info.version === 'string' ? info.version : null
  const behindLatest = latest ? compareVersions(pinned, latest) : null
  if (latest && pinned !== 'latest' && behindLatest !== null && behindLatest < 0) {
    notes.push({message: `pinned to ${pinned}, latest is ${latest}`, slug})
  }

  const lastUpdated = typeof info.last_updated === 'string' ? info.last_updated : null
  if (lastUpdated) {
    const years = (Date.now() - Date.parse(lastUpdated)) / (365 * 24 * 3600 * 1000)
    if (years > 2) notes.push({message: `last updated ${lastUpdated.slice(0, 10)} (possibly abandoned)`, slug})
  }

  return notes
}
