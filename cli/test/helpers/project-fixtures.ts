import {type EnvironmentConfig, type ProjectConfig} from '../../src/types/config.js'

// addedAt defaults to "now" (not a fixed past date) so fixture consumers don't incidentally
// trip the app-password-staleness check in LoopressCommand; pass one explicitly to test that.
export function makeEnv(name: string, url = 'https://example.com', token = 'user:pass', addedAt = new Date().toISOString()): EnvironmentConfig {
  return {addedAt, name, token, url}
}

// A copy of `env` with no stored credentials, the way an environment reads before any token was saved.
export function withoutToken<T extends EnvironmentConfig>(env: T): T {
  const copy = {...env}
  delete copy.token
  return copy
}

export function makeListedEnv(name: string, url = 'https://example.com', isDefault = false): EnvironmentConfig & {isDefault: boolean} {
  return {...makeEnv(name, url), isDefault}
}

export function makeListedProject(
  id: string,
  name: string,
  environments: Record<string, EnvironmentConfig>,
  isCurrent = false,
): ProjectConfig & {id: string; isCurrent: boolean} {
  return {addedAt: '2024-01-01T00:00:00.000Z', environments, id, isCurrent, name}
}
