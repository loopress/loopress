// Shared helpers for driving the server-side `loopress/v1/composer/sync` endpoint, used by
// `lps plugin push`, `lps theme version push` and `lps composer push`. The endpoint runs Composer +
// WPackagist inside WordPress; the CLI only ever sends intent (which slugs at which versions),
// never a composer.json, so the plugin stays the single authority on that file's shape.

import {z} from 'zod'

import {causeOf} from '../lib/narrow.js'
import {parseBody, responseOf} from '../lib/wp-client.js'
import {compareVersions} from './version.js'

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

// One package whose version the server resolved differently from the local composer.lock the
// CLI sent. Informational only: the server always resolves composer.json itself and never
// installs from the lock the CLI uploads (that would let a crafted lock pull code from
// arbitrary hosts). `from`/`to` are null when the package was absent locally / removed on the
// server.
export type LockDriftEntry = {
  from: null | string
  name: string
  to: null | string
}

export type SyncResponse = {
  composerJson: string
  composerLock: string
  // Present since the server stopped installing from the uploaded lock; older servers omit it.
  lockDrift?: LockDriftEntry[]
  message: string
  output: string
  // Packages `composer update` uninstalled because they left the intent, e.g. "wpackagist-plugin/redirection".
  // Older servers omit it.
  removed?: string[]
}

// The server also sends installedVersion, path and type, only the slug is read here.
const COLLISIONS = z.array(z.looseObject({slug: z.string()}))

export type Collision = z.infer<typeof COLLISIONS>[number]

// 422 from the sync endpoint when the intent references a plugin/theme whose folder already
// exists on the site but isn't tracked in composer.lock (installed by hand through wp-admin).
// Re-running with --force lets the server remove the folder so Composer can take it over.
export function parseCollisions(error: unknown): Collision[] | null {
  const {body, statusCode} = responseOf(causeOf(error))
  if (statusCode !== 422) return null

  const parsed = parseBody(body)
  if (parsed.error !== 'unmanaged_plugins_present') return null
  const collisions = COLLISIONS.safeParse(parsed.collisions)
  return collisions.success ? collisions.data : null
}

// Only gates whether a version change needs --force. Unorderable inputs ("latest", a
// constraint) count as "not a downgrade" so they don't block the push.
export function isDowngrade(from: string, to: string): boolean {
  const order = compareVersions(to, from)
  return order !== null && order < 0
}
