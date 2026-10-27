import got from 'got'

import {LoopressCommand} from '../../lib/base.js'
import {withSpinner} from '../../lib/spinner.js'
import {pinVersion} from '../../types/plugin.js'
import {compareVersions} from '../../utils/version.js'

type Advisory = {
  cve?: string | undefined
  fixedIn?: string | undefined
  score?: number | undefined
  severity?: string | undefined
  slug: string
  title: string
}

// The affected range of one advisory, from wpvulnerability's `operator` object.
type Range = {max?: Bound | undefined; min?: Bound | undefined}
type Bound = {op: string; version: string}

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
  static override description = 'Check the plugins in loopress.json for known vulnerabilities (wpvulnerability.net) and health issues'
  static override enableJsonFlag = true
  static override examples = ['$ lps plugin audit']
  static override flags = {}

  async run(): Promise<AuditResult> {
    const manifest = {...this.localConfig.plugins}
    const slugs = Object.keys(manifest)

    if (slugs.length === 0) {
      this.log('No plugins in loopress.json to audit.')
      return {advisories: [], health: [], status: 'clean'}
    }

    const advisories: Advisory[] = []
    const health: HealthNote[] = []
    for (const [slug, pin] of Object.entries(manifest)) {
      const found = await withSpinner(`Auditing ${slug}`, async () => this.auditOne(slug, pinVersion(pin)))
      advisories.push(...found.advisories)
      health.push(...found.health)
    }

    return this.report(advisories, health, slugs.length)
  }

  private async auditOne(slug: string, pinned: string): Promise<{advisories: Advisory[]; health: HealthNote[]}> {
    const [vulns, info] = await Promise.all([this.fetchVulnerabilities(slug), this.fetchHealth(slug)])
    // "latest" is the newest WordPress.org release, the one a push installs: audit that version.
    // Unknown (WordPress.org unreachable), every advisory is reported, safer than none.
    const version = pinned === 'latest' && typeof info?.version === 'string' ? info.version : pinned
    const advisories = vulns
      .filter((v) => version === 'latest' || affects(version, v.range))
      .map(({range: _range, ...v}) => ({...v, slug}))
    const health = info ? describeHealth(slug, pinned, info) : []
    return {advisories, health}
  }

  private async fetchHealth(slug: string): Promise<null | Record<string, unknown>> {
    try {
      const body = await got(WPORG_INFO, {
        searchParams: {action: 'plugin_information', 'request[slug]': slug},
        timeout: {request: 10_000},
      }).json<Record<string, unknown>>()
      return typeof body === 'object' && !('error' in body) ? body : null
    } catch {
      return null
    }
  }

  private async fetchVulnerabilities(slug: string): Promise<Array<Omit<Advisory, 'slug'> & {range: Range}>> {
    let body: null | {data?: {vulnerability?: unknown[]}}
    try {
      body = await got(`${WPVULN_BASE}/${encodeURIComponent(slug)}/`, {
        timeout: {request: 10_000},
      }).json<typeof body>()
    } catch (error) {
      // Never swallow this into an empty list: a clean audit must mean "no advisories found",
      // not "the advisory service was unreachable". Fail the command instead.
      throw new Error(
        `Could not reach the vulnerability database (wpvulnerability.net) for "${slug}": ${(error as Error).message}. ` +
          'Audit aborted so a service outage is not reported as a clean result.',
        {cause: error},
      )
    }

    // A 200 with the wrong shape (degraded service) must not read as "no advisories" either.
    const list = body?.data?.vulnerability
    if (!Array.isArray(list)) {
      throw new TypeError(
        `Unexpected answer from the vulnerability database (wpvulnerability.net) for "${slug}". ` +
          'Audit aborted so a malformed response is not reported as a clean result.',
      )
    }

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

    // exit() throws before oclif prints the --json result, which a CI reading it needs most here.
    if (advisories.length > 0) {
      if (this.jsonEnabled()) process.exitCode = 1
      else this.exit(1)
    }

    return {advisories, health, status: 'issues'}
  }
}

function advisoryMeta(a: Advisory): string {
  const fixed = a.fixedIn ? `fixed in ${a.fixedIn}` : undefined
  const parts = [a.severity, a.cve, fixed].filter(Boolean)
  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

function normalizeAdvisory(raw: Record<string, unknown>): Omit<Advisory, 'slug'> & {range: Range} {
  const cvss = (raw.cvss ?? {}) as {score?: number; severity?: string}
  const source = Array.isArray(raw.source) ? (raw.source as Array<{id?: string}>) : []
  const cve = typeof raw.cve === 'string' ? raw.cve : source.find((s) => s.id?.startsWith('CVE-'))?.id

  const range = extractRange(raw)
  return {
    cve,
    fixedIn: range.max?.op === 'lt' ? range.max.version : undefined,
    range,
    score: cvss.score,
    severity: cvss.severity,
    title: typeof raw.name === 'string' ? decodeEntities(raw.name) : 'Unnamed advisory',
  }
}

// wpvulnerability's `operator`: `max_version` with `max_operator` "lt" (fixed in that version),
// "le" (affected up to it, no fix yet) or "eq" (that version only), and an optional lower bound `min_version` with
// `min_operator` "gt" or "ge". No upper bound means every version from the lower one on.
function toBound(version: unknown, operator: unknown): Bound | undefined {
  return typeof version === 'string' && version !== '' && typeof operator === 'string' ? {op: operator, version} : undefined
}

function extractRange(raw: Record<string, unknown>): Range {
  const op = (raw.operator ?? {}) as Record<string, unknown>
  return {max: toBound(op.max_version, op.max_operator), min: toBound(op.min_version, op.min_operator)}
}

// A bound we can't evaluate (odd version strings, unknown operator) counts as affected: a false
// positive is safer than hiding an advisory.
function affects(version: string, range: Range): boolean {
  const within = (bound: Bound | undefined, ok: Record<string, (order: number) => boolean>): boolean => {
    if (!bound) return true
    const order = compareVersions(version, bound.version)
    const check = Object.hasOwn(ok, bound.op) ? ok[bound.op] : undefined
    return order === null || !check || check(order)
  }

  return (
    within(range.min, {ge: (o) => o >= 0, gt: (o) => o > 0}) && within(range.max, {eq: (o) => o === 0, le: (o) => o <= 0, lt: (o) => o < 0})
  )
}

// Advisory names come HTML-encoded ("WPForms &#8211; AI Form Builder").
function decodeEntities(text: string): string {
  return text
    .replaceAll(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
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
    const years = (Date.now() - parseWordPressDate(lastUpdated)) / (365 * 24 * 3600 * 1000)
    if (years > 2) notes.push({message: `last updated ${lastUpdated.slice(0, 10)} (possibly abandoned)`, slug})
  }

  return notes
}

// WordPress.org's plugins API returns `last_updated` as "2015-03-04 10:00am GMT", which
// Date.parse() reads as NaN. Rewrite that form to ISO, and leave anything else to Date.parse().
function parseWordPressDate(value: string): number {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})(am|pm) GMT$/i.exec(value)
  if (!match) return Date.parse(value)
  const [, day, hour, minute, half] = match
  const hours = (Number(hour) % 12) + (half?.toLowerCase() === 'pm' ? 12 : 0)
  return Date.parse(`${day}T${String(hours).padStart(2, '0')}:${minute}:00Z`)
}
