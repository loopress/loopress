import {EnvironmentConfig, ProjectConfig} from '../../src/types/config.js'

export function makeEnv(name: string, url = 'https://example.com', token = 'user:pass'): EnvironmentConfig {
  return {addedAt: '2024-01-01T00:00:00.000Z', name, token, url}
}

export function makeListedEnv(name: string, url = 'https://example.com', isCurrent = false): EnvironmentConfig & {isCurrent: boolean} {
  return {...makeEnv(name, url), isCurrent}
}

export function makeListedProject(
  id: string,
  name: string,
  environments: Record<string, EnvironmentConfig>,
  isCurrent = false,
): ProjectConfig & {id: string; isCurrent: boolean} {
  return {addedAt: '2024-01-01T00:00:00.000Z', environments, id, isCurrent, name}
}
