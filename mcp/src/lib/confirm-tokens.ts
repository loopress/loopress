import {randomUUID} from 'node:crypto'

const TTL_MS = 5 * 60 * 1000

// ponytail: an abandoned preview (an agent that never calls back with the token) would
// otherwise sit in the Map until the process restarts. Hard cap, not a real LRU cache.
const MAX_PENDING = 100

interface PendingConfirmation {
  args: string[]
  expiresAt: number
  tool: string
}

// ponytail: single in-memory Map, fine for one stdio server serving one client per process;
// a shared/clustered MCP server would need external storage instead.
const pending = new Map<string, PendingConfirmation>()

function pruneExpired(): void {
  const now = Date.now()
  for (const [token, entry] of pending) {
    if (now > entry.expiresAt) pending.delete(token)
  }
}

export function createConfirmation(tool: string, args: string[]): {confirmToken: string; expiresAt: string} {
  pruneExpired()

  // Still at capacity after pruning (a burst of previews nobody confirmed): evict the oldest
  // rather than fail this preview call. Maps preserve insertion order, so the first key is it.
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value
    if (oldest !== undefined) pending.delete(oldest)
  }

  const confirmToken = randomUUID()
  const expiresAt = Date.now() + TTL_MS
  pending.set(confirmToken, {args, expiresAt, tool})
  return {confirmToken, expiresAt: new Date(expiresAt).toISOString()}
}

export type ConsumeResult = {args: string[]; ok: true} | {error: {message: string; name: string}; ok: false}

// Single-use: deleted on lookup regardless of outcome, so a replayed token always fails on the
// second attempt even if the first attempt itself failed validation.
export function consumeConfirmation(tool: string, confirmToken: string): ConsumeResult {
  const entry = pending.get(confirmToken)
  pending.delete(confirmToken)

  if (!entry) {
    return {
      error: {
        message: 'Unknown or already-used confirmToken. Call the tool again without one for a fresh preview.',
        name: 'INVALID_CONFIRM_TOKEN',
      },
      ok: false,
    }
  }

  if (entry.tool !== tool) {
    return {
      error: {message: `confirmToken was issued for "${entry.tool}", not "${tool}".`, name: 'INVALID_CONFIRM_TOKEN'},
      ok: false,
    }
  }

  if (Date.now() > entry.expiresAt) {
    return {
      error: {
        message: 'confirmToken has expired. Call the tool again without one for a fresh preview.',
        name: 'CONFIRM_TOKEN_EXPIRED',
      },
      ok: false,
    }
  }

  return {args: entry.args, ok: true}
}
