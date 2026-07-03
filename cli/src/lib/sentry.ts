import {platform, release} from 'node:os'

// DSNs are write-only and safe to embed in a distributed CLI, see https://docs.sentry.io/product/security/#can-i-make-my-sentry-dsn-private
export const SENTRY_DSN = 'https://a08dd56bfffc2a45d5b8f665e4cb8b7d@o4511586904309760.ingest.de.sentry.io/4511673275973712'

export function consumeErrorReportingFlag(argv: string[]): void {
  const index = argv.indexOf('--no-error-reporting')
  if (index === -1) return

  argv.splice(index, 1)
  process.env.LOOPRESS_TELEMETRY_DISABLED = '1'
}

export function isTelemetryDisabled(): boolean {
  return process.env.LOOPRESS_TELEMETRY_DISABLED === '1'
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
