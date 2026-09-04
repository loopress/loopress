// Shared helpers for driving the server-side `loopress/v1/composer/sync` endpoint, used by
// `lps plugin push`, `lps theme push` and `lps composer push`. The endpoint runs Composer +
// WPackagist inside WordPress; the CLI only ever sends intent (which slugs at which versions),
// never a composer.json, so the plugin stays the single authority on that file's shape.

// A cold `composer update` on a fresh site easily exceeds the global 30s WpClient timeout.
export const SYNC_TIMEOUT_MS = 600_000

export type SyncIntent = {
  // require entries that are not wpackagist-plugin/* or wpackagist-theme/*
  libraries?: Record<string, string>
  // slug -> exact version or "latest"
  plugins?: Record<string, string>
  themes?: Record<string, string>
}

export type SyncPayload = {
  force: boolean
  intent: SyncIntent
  lock: null | string
}

export type SyncResponse = {
  composerJson: string
  composerLock: string
  message: string
  output: string
  // Packages `composer update` uninstalled because they left the intent, e.g. "wpackagist-plugin/redirection".
  removed: string[]
}

export type Collision = {
  installedVersion: string
  path: string
  slug: string
  type: 'plugin' | 'theme'
}

// 422 from the sync endpoint when the intent references a plugin/theme whose folder already
// exists on the site but isn't tracked in composer.lock (installed by hand through wp-admin).
// Re-running with --force lets the server remove the folder so Composer can take it over.
export function parseCollisions(error: unknown): Collision[] | null {
  const body = (error as {cause?: {response?: {body?: string; statusCode?: number}}}).cause?.response
  if (body?.statusCode !== 422 || !body.body) return null

  try {
    const parsed = JSON.parse(body.body) as {collisions?: Collision[]; error?: string}
    if (parsed.error === 'unmanaged_plugins_present' && Array.isArray(parsed.collisions)) {
      return parsed.collisions
    }
  } catch {
    return null
  }

  return null
}

// ponytail: naive numeric-segment compare, no prerelease ordering. Only gates whether a
// version change needs --force; a wrong call just means the user passes --force for a
// sidegrade that was fine anyway.
export function isDowngrade(from: string, to: string): boolean {
  const seg = (v: string): number[] => v.split(/[.\-+]/).map((n) => Number(n) || 0)
  const a = seg(to)
  const b = seg(from)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }

  return false
}
