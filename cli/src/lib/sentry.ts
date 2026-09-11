import type {ErrorEvent} from '@sentry/node'

import {platform, release} from 'node:os'

import {configManager} from '../config/project-config.manager.js'

// DSNs are write-only and safe to embed in a distributed CLI, see https://docs.sentry.io/product/security/#can-i-make-my-sentry-dsn-private
export const SENTRY_DSN = 'https://a08dd56bfffc2a45d5b8f665e4cb8b7d@o4511586904309760.ingest.de.sentry.io/4511673275973712'

// The env var takes priority so CI/ephemeral environments can opt out for a single run
// without touching the persistent preference in the global config.json.
export function isTelemetryDisabled(): boolean {
  if (process.env.LOOPRESS_TELEMETRY_DISABLED === '1') return true
  return configManager.isTelemetryDisabled()
}

export function resolveEnvironment(): string {
  if (process.env.SENTRY_ENVIRONMENT) return process.env.SENTRY_ENVIRONMENT
  return process.env.NODE_ENV === 'development' ? 'development' : 'production'
}

export function runtimeContext(): {node: string; os: string} {
  return {
    node: process.version,
    os: `${platform()} ${release()}`,
  }
}

// Positional args and flag values can carry WordPress URLs, usernames, application passwords,
// or tokens (e.g. `lps login --token xxx`, `lps project config <url>`). Only flag names are
// safe to report, they help tell which code path crashed without leaking what was passed to it.
export function redactArgv(argv: string[]): string[] {
  return argv.map((arg) => {
    if (!arg.startsWith('-')) return '[REDACTED]'
    const eqIndex = arg.indexOf('=')
    return eqIndex === -1 ? arg : arg.slice(0, eqIndex)
  })
}

// The site origin in front of a `/wp-json/` REST path: collapse it but keep the path, which is
// Loopress's own API surface (identical on every site, no user data) and useful for triage.
const SITE_PREFIX = /\bhttps?:\/\/[^\s"'<>)]*?\/wp-json\//gi
// Any other absolute URL (bare site root, a package URL on the summary line): blank it whole.
const ANY_URL = /\bhttps?:\/\/[^\s"'<>)]+/gi

// A WordPress request failure (`formatWpError`) puts the site URL on the first line and, for a
// 4xx/5xx, appends the server's raw response body after a newline: a Composer trace, a WP fatal,
// sometimes absolute server paths, package URLs or a connection string. None of that should
// leave the user's machine. Keep the first line (the "which endpoint, which status" summary)
// with the site host blanked, and drop everything after it. The terminal still prints the
// full, unmodified message.
export function scrubErrorMessage(value: string): string {
  const firstLine = value.split('\n', 1)[0] ?? ''
  return firstLine.replaceAll(SITE_PREFIX, '<site>/wp-json/').replaceAll(ANY_URL, '<site>').slice(0, 300)
}

// Sentry `beforeSend`: runs on every event before it is sent. Scrubs the exception message(s)
// (including chained `cause` errors, which the linkedErrors integration copies in) and drops
// any request context. `extra.argv` is already redacted upstream by `redactArgv`.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (typeof event.message === 'string') {
    event.message = scrubErrorMessage(event.message)
  }

  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === 'string') {
      exception.value = scrubErrorMessage(exception.value)
    }
  }

  delete event.request
  return event
}
