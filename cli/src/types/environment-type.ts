export const ENVIRONMENT_TYPES = ['local', 'staging', 'production'] as const

export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number]

// config.json is hand-editable and may predate types: check at runtime, not only in the type.
export function isEnvironmentType(value: unknown): value is EnvironmentType {
  return typeof value === 'string' && (ENVIRONMENT_TYPES as readonly string[]).includes(value)
}
