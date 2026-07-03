import {platform, release} from 'node:os'

const SENSITIVE_FLAGS = new Set(['--password', '--token', '--user'])

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

// Redacts flag values that could carry WordPress credentials (see LoopressCommand.baseFlags)
// before they're attached to a Sentry event.
export function scrubArgv(argv: string[]): string[] {
  const scrubbed: string[] = []
  let redactNext = false

  for (const token of argv) {
    if (redactNext) {
      scrubbed.push('[REDACTED]')
      redactNext = false
      continue
    }

    const [flag] = token.split('=')
    if (!SENSITIVE_FLAGS.has(flag)) {
      scrubbed.push(token)
      continue
    }

    if (token.includes('=')) {
      scrubbed.push(`${flag}=[REDACTED]`)
    } else {
      scrubbed.push(token)
      redactNext = true
    }
  }

  return scrubbed
}
