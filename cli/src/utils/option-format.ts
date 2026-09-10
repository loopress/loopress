export const OPTIONS_ENDPOINT = 'loopress/v1/options'

export function optionEndpoint(name: string): string {
  return `${OPTIONS_ENDPOINT}/${encodeURIComponent(name)}`
}

// Mirrors OptionsService::RESERVED_NAMES on the WordPress side (the actual, unbypassable
// enforcement lives there). Checked here too so `option add` fails fast with a clear pointer to
// the right command, instead of a round trip just to hit the server's 409.
export const RESERVED_OPTION_NAMES = ['active_plugins', 'stylesheet', 'template'] as const

// Options WordPress core owns or regenerates itself, plus the ones OptionsService::
// DENY_WRITE_NAMES refuses server-side (behaviour-changing core options: default_role,
// users_can_register, mailserver_*, ...). Legitimate to track for visibility (`diff` still
// shows drift), but never something `push` should overwrite by default. siteurl/home in
// particular: pushing a value copied from another environment would repoint the target site's
// own URLs, potentially locking out wp-admin. Flip `readonly` in the file to push one anyway;
// for the server-denied names that then needs the `loopress_option_writable` filter too.
export const READONLY_BY_DEFAULT_OPTION_NAMES = [
  'siteurl',
  'home',
  'db_version',
  'initial_db_version',
  'cron',
  'rewrite_rules',
  'WPLANG',
  'default_role',
  'users_can_register',
  'uninstall_plugins',
  'mailserver_url',
  'mailserver_login',
  'mailserver_pass',
  'mailserver_port',
] as const

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

  const {autoload, name, value} = parsed as {autoload?: unknown; name?: unknown; value?: unknown}
  if (typeof name !== 'string' || name === '') {
    throw new Error('missing a "name" string')
  }

  if (typeof autoload !== 'string') {
    throw new TypeError('missing an "autoload" string')
  }

  // `value` itself is deliberately untyped (a WP option can hold any JSON-safe value, including
  // null); only the key's presence is checked, so a hand-edited file that dropped it entirely is
  // rejected here rather than silently pushing an `undefined` value to WordPress.
  if (value === undefined) {
    throw new Error('missing a "value" field')
  }

  return parsed as LocalOption
}
