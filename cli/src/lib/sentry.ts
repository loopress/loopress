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
