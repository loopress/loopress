import {createHash} from 'node:crypto'
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises'
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
  // `staging.eu` and `staging-eu` sanitize alike: a hash of the real name keeps their records apart.
  const safe = sanitizeForPath(environment)
  const name = safe === environment ? safe : `${safe}-${createHash('sha256').update(environment).digest('hex').slice(0, 8)}`
  return join(rootDir, '.loopress', 'last-seen', sanitizeForPath(resource), `${name}.json`)
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

// Replaces what was recorded, except for a `scope` (ACF pulls one type at a time, its keys
// are `<type>/<key>`): the recorded keys and state entries outside that prefix are kept.
export async function writeLastSeen(
  rootDir: string,
  resource: string,
  environment: string,
  update: {keys: Iterable<string>; scope?: string; state?: ResourceState},
): Promise<void> {
  const previous = await readLastSeen(rootDir, resource, environment)
  const {scope} = update
  const outside = (key: string): boolean => scope !== undefined && !key.startsWith(scope)
  const keys = new Set([...[...(previous?.keys ?? [])].filter((key) => outside(key)), ...update.keys])
  const state: ResourceState | undefined =
    scope === undefined
      ? (update.state ?? previous?.state)
      : new Map([...[...(previous?.state ?? [])].filter(([key]) => outside(key)), ...(update.state ?? [])])
  const path = lastSeenPath(rootDir, resource, environment)
  await mkdir(join(path, '..'), {recursive: true})
  // Same self-ignoring `.loopress/` as the snapshots: never committed.
  try {
    await writeFile(join(rootDir, '.loopress', '.gitignore'), '# Written by the Loopress CLI: local rollback snapshots, never commit them.\n*\n', {flag: 'wx'})
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
  }

  // Written aside then renamed, so an interruption never leaves truncated JSON behind.
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(
    temporary,
    JSON.stringify({keys: [...keys].toSorted((a, b) => a.localeCompare(b)), ...(state && {state: stateToRecord(state)}), updatedAt: new Date().toISOString()}, null, 2) + '\n',
  )
  await rename(temporary, path)
}
