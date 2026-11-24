import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'

import {type ResourceState} from './diff-state.js'
import {errorCode} from './narrow.js'
import {recordToState, sanitizeForPath, stateToRecord} from './snapshot-store.js'

// What this machine last saw of one resource on one environment, written by every pull and
// every push. Kept in `.loopress/last-seen/`, next to (not inside) the rollback snapshots,
// which keep their own meaning and retention. Two readers:
// - `keys`: the identities the site held, so a pull deletes a local file only when it existed
//   on the site and is gone, never a file that was not pushed yet.
// - `state`: the site's content, the baseline of the push guard against edits made outside
//   Loopress, so a pull moves it the way a push does.
const LAST_SEEN = z.object({
  keys: z.array(z.string()),
  state: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.string(),
})

export type LastSeen = {keys: Set<string>; state?: ResourceState; updatedAt: string}

function lastSeenPath(rootDir: string, resource: string, environment: string): string {
  return join(rootDir, '.loopress', 'last-seen', sanitizeForPath(resource), `${sanitizeForPath(environment)}.json`)
}

// Undefined when nothing was recorded (a fresh clone) or the file is unreadable: callers then
// treat everything local as not seen, the safe side.
export async function readLastSeen(rootDir: string, resource: string, environment: string): Promise<LastSeen | undefined> {
  try {
    const raw: unknown = JSON.parse(await readFile(lastSeenPath(rootDir, resource, environment), 'utf8'))
    const parsed = LAST_SEEN.parse(raw)
    return {keys: new Set(parsed.keys), updatedAt: parsed.updatedAt, ...(parsed.state && {state: recordToState(parsed.state)})}
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || error instanceof SyntaxError || error instanceof z.ZodError) return undefined
    throw error
  }
}

// Keys are merged with what was there (ACF pulls one type at a time), state replaces it.
export async function writeLastSeen(
  rootDir: string,
  resource: string,
  environment: string,
  update: {keys: Iterable<string>; state?: ResourceState},
): Promise<void> {
  const previous = await readLastSeen(rootDir, resource, environment)
  const keys = new Set([...(previous?.keys ?? []), ...update.keys])
  const state = update.state ?? previous?.state
  const path = lastSeenPath(rootDir, resource, environment)
  await mkdir(join(path, '..'), {recursive: true})
  // Same self-ignoring `.loopress/` as the snapshots: never committed.
  try {
    await writeFile(join(rootDir, '.loopress', '.gitignore'), '# Written by the Loopress CLI: local rollback snapshots, never commit them.\n*\n', {flag: 'wx'})
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
  }

  await writeFile(
    path,
    JSON.stringify({keys: [...keys].toSorted((a, b) => a.localeCompare(b)), ...(state && {state: stateToRecord(state)}), updatedAt: new Date().toISOString()}, null, 2) + '\n',
  )
}
