export const OPTIONS_ENDPOINT = 'loopress/v1/options'

export function optionEndpoint(name: string): string {
  return `${OPTIONS_ENDPOINT}/${encodeURIComponent(name)}`
}

// Mirrors OptionsService::RESERVED_NAMES on the WordPress side (the actual, unbypassable
// enforcement lives there). Checked here too so `option add` fails fast with a clear pointer to
// the right command, instead of a round trip just to hit the server's 409.
export const RESERVED_OPTION_NAMES = ['active_plugins', 'stylesheet', 'template'] as const

// Options WordPress core owns or regenerates itself: legitimate to track for visibility (`diff`
// still shows drift), but never something `push` should overwrite by default. siteurl/home in
// particular: pushing a value copied from another environment would repoint the target site's
// own URLs, potentially locking out wp-admin.
export const READONLY_BY_DEFAULT_OPTION_NAMES = ['siteurl', 'home', 'db_version', 'cron', 'rewrite_rules', 'WPLANG'] as const

export type LocalOption = {
  autoload: string
  name: string
  readonly?: boolean
  value: unknown
}

export type RemoteOption = {
  autoload: string
  name: string
  value: unknown
}

// GET /options row shape: discovery only, never a value (see OptionsController). `core` is a
// certain fact (matched against WordPress's own install-time defaults); `guess` is a best-effort,
// possibly-wrong hint (an active plugin's slug whose prefix happens to match, or a source-scan
// hit, always run), always null once `core` is true. `confirmed` is only meaningful when `guess`
// is set: true means the guessed plugin's own source really does reference the name (a real scan
// hit), still not proof of ownership the way `core` is, but stronger than an unconfirmed naming
// match. `pluginName` is a plain lookup of `guess` (the slug) against that plugin's own declared
// Name header, purely a label, it carries no confidence of its own; null whenever `guess` is.
export type ListedOption = {
  autoload: string
  confirmed: boolean
  core: boolean
  guess: null | string
  name: string
  pluginName: null | string
}

export function isReservedOptionName(name: string): boolean {
  return (RESERVED_OPTION_NAMES as readonly string[]).includes(name)
}

export function defaultReadonlyFor(name: string): boolean {
  return (READONLY_BY_DEFAULT_OPTION_NAMES as readonly string[]).includes(name)
}

export function optionFileName(name: string): string {
  return `${name}.json`
}

// Splits tracked options into what `push` may write and what it must skip: readonly is a local
// policy flag (see READONLY_BY_DEFAULT_OPTION_NAMES), never something WordPress itself enforces.
export function partitionByReadonly(tracked: LocalOption[]): {skipped: LocalOption[]; writable: LocalOption[]} {
  const writable: LocalOption[] = []
  const skipped: LocalOption[] = []
  for (const option of tracked) (option.readonly ? skipped : writable).push(option)

  return {skipped, writable}
}

export function parseLocalOption(raw: string): LocalOption {
  const parsed = JSON.parse(raw) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('not a JSON object')
  }

  const {name} = parsed as {name?: unknown}
  if (typeof name !== 'string' || name === '') {
    throw new Error('missing a "name" string')
  }

  return parsed as LocalOption
}
