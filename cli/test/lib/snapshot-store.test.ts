import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {listSnapshots, readSnapshot, recordToState, stateToRecord, writeSnapshot} from '../../src/lib/snapshot-store.js'

// Snapshot ids are millisecond timestamps; a couple of tests need two distinct ones to assert
// ordering, so this nudges the clock forward between writes.
async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe('snapshot-store', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'lps-snapshot-store-'))
  })

  afterEach(() => {
    rmSync(rootDir, {force: true, recursive: true})
  })

  it('round-trips a ResourceState through stateToRecord/recordToState', () => {
    // Built out of insertion order, on purpose: two snapshots of an equivalent Map must
    // serialize identically regardless of iteration order.
    /* eslint-disable perfectionist/sort-maps -- the out-of-order insertion is the point */
    const state = new Map<string, unknown>([
      ['2', {name: 'b'}],
      ['1', {name: 'a'}],
    ])
    /* eslint-enable perfectionist/sort-maps */

    const record = stateToRecord(state)

    expect(Object.keys(record)).toEqual(['1', '2'])
    expect(recordToState(record)).toEqual(state)
  })

  it('writes a snapshot readable back with the same before/after state', async () => {
    const beforeState = new Map<string, unknown>([['7', {name: 'old'}]])
    const afterState = new Map<string, unknown>([['7', {name: 'new'}]])

    const id = await writeSnapshot({afterState, beforeState, environment: 'staging', resource: 'snippet', rootDir})

    const snapshot = await readSnapshot(rootDir, 'snippet', 'staging', id)
    expect(snapshot.id).toBe(id)
    expect(snapshot.environment).toBe('staging')
    expect(snapshot.beforeState).toEqual({7: {name: 'old'}})
    expect(snapshot.afterState).toEqual({7: {name: 'new'}})
  })

  it('makes .loopress/ ignore itself in git, without overwriting an existing .gitignore there', async () => {
    const base = {afterState: new Map(), beforeState: new Map(), environment: 'local', resource: 'snippet'}
    await writeSnapshot({...base, rootDir})
    expect(readFileSync(join(rootDir, '.loopress', '.gitignore'), 'utf8')).toMatch(/^\*$/m)

    const other = mkdtempSync(join(tmpdir(), 'lps-snapshot-store-own-ignore-'))
    try {
      mkdirSync(join(other, '.loopress'))
      writeFileSync(join(other, '.loopress', '.gitignore'), 'snapshots/\n')
      await writeSnapshot({...base, rootDir: other})
      expect(readFileSync(join(other, '.loopress', '.gitignore'), 'utf8')).toBe('snapshots/\n')
    } finally {
      rmSync(other, {force: true, recursive: true})
    }
  })

  it('readSnapshot with no id reads the most recent snapshot', async () => {
    const empty = new Map()
    await writeSnapshot({afterState: empty, beforeState: new Map([['a', 1]]), environment: 'staging', resource: 'snippet', rootDir})
    await wait(2)
    const second = await writeSnapshot({afterState: empty, beforeState: new Map([['b', 2]]), environment: 'staging', resource: 'snippet', rootDir})

    const latest = await readSnapshot(rootDir, 'snippet', 'staging')
    expect(latest.id).toBe(second)
    expect(latest.beforeState).toEqual({b: 2})
  })

  it('lists snapshots newest first, scoped to one resource', async () => {
    const empty = new Map()
    const first = await writeSnapshot({afterState: empty, beforeState: empty, environment: 'staging', resource: 'snippet', rootDir})
    await wait(2)
    const second = await writeSnapshot({afterState: empty, beforeState: empty, environment: 'staging', resource: 'snippet', rootDir})
    await writeSnapshot({afterState: empty, beforeState: empty, environment: 'staging', resource: 'form', rootDir})

    const snippetSnapshots = await listSnapshots(rootDir, 'snippet', 'staging')

    expect(snippetSnapshots.map((s) => s.id)).toEqual([second, first])
  })

  it('lists an empty array when nothing has ever been snapshotted for a resource', async () => {
    expect(await listSnapshots(rootDir, 'snippet', 'staging')).toEqual([])
  })

  it('readSnapshot throws a clear error when there are no snapshots at all', async () => {
    await expect(readSnapshot(rootDir, 'snippet', 'staging')).rejects.toThrow(/No snapshots found for "snippet" on "staging"/)
  })

  it('readSnapshot throws a clear error for an unknown id', async () => {
    await expect(readSnapshot(rootDir, 'snippet', 'staging', '123')).rejects.toThrow(/Snapshot "123" not found for "snippet" on "staging"/)
  })

  it('prunes down to the retention limit, oldest first, on every write', async () => {
    const empty = new Map()
    const ids: string[] = []
    for (let index = 0; index < 5; index++) {
      ids.push(await writeSnapshot({afterState: empty, beforeState: empty, environment: 'staging', resource: 'snippet', retain: 3, rootDir}))
      await wait(2)
    }

    const remaining = await listSnapshots(rootDir, 'snippet', 'staging')

    // eslint-disable-next-line unicorn/no-array-reverse -- toReversed() needs an ES2023 lib target this package doesn't use
    expect(remaining.map((s) => s.id)).toEqual([...ids].reverse().slice(0, 3))
  })

  it('skips a corrupted snapshot file instead of failing the whole listing', async () => {
    const empty = new Map()
    const id = await writeSnapshot({afterState: empty, beforeState: empty, environment: 'staging', resource: 'snippet', rootDir})
    writeFileSync(join(rootDir, '.loopress', 'snapshots', 'snippet', 'staging', '999999999999.json'), '{ not valid json')

    const snapshots = await listSnapshots(rootDir, 'snippet', 'staging')

    expect(snapshots.map((s) => s.id)).toEqual([id])
  })

  it('scopes listing, reading, and pruning by environment: a staging snapshot never answers a production rollback', async () => {
    const empty = new Map()
    const stagingId = await writeSnapshot({
      afterState: empty,
      beforeState: new Map([['a', 'staging value']]),
      environment: 'staging',
      resource: 'snippet',
      rootDir,
    })
    await wait(2)
    const productionId = await writeSnapshot({
      afterState: empty,
      beforeState: new Map([['a', 'production value']]),
      environment: 'production',
      resource: 'snippet',
      rootDir,
    })

    expect((await listSnapshots(rootDir, 'snippet', 'staging')).map((s) => s.id)).toEqual([stagingId])
    expect((await listSnapshots(rootDir, 'snippet', 'production')).map((s) => s.id)).toEqual([productionId])

    // The most recent snapshot overall is production's, but a staging rollback must still
    // resolve to staging's own latest, never fall through to it.
    const latestForStaging = await readSnapshot(rootDir, 'snippet', 'staging')
    expect(latestForStaging.id).toBe(stagingId)
    expect(latestForStaging.beforeState).toEqual({a: 'staging value'})

    // An explicit --to id from another environment must not be readable through this one.
    await expect(readSnapshot(rootDir, 'snippet', 'staging', productionId)).rejects.toThrow(/not found/)
  })

  it('prunes only the current environment, never another one sharing the same resource', async () => {
    const empty = new Map()
    for (let index = 0; index < 3; index++) {
       
      await writeSnapshot({afterState: empty, beforeState: empty, environment: 'staging', resource: 'snippet', retain: 1, rootDir})
       
      await wait(2)
    }

    await writeSnapshot({afterState: empty, beforeState: empty, environment: 'production', resource: 'snippet', retain: 1, rootDir})

    expect(await listSnapshots(rootDir, 'snippet', 'staging')).toHaveLength(1)
    expect(await listSnapshots(rootDir, 'snippet', 'production')).toHaveLength(1)
  })

  it('retries with the next millisecond instead of overwriting an existing snapshot file', async () => {
    const empty = new Map()
    const realNow = Date.now
    vi.spyOn(Date, 'now').mockReturnValue(realNow())
    try {
      const first = await writeSnapshot({afterState: empty, beforeState: new Map([['a', 'first']]), environment: 'staging', resource: 'snippet', rootDir})
      const second = await writeSnapshot({afterState: empty, beforeState: new Map([['a', 'second']]), environment: 'staging', resource: 'snippet', rootDir})

      expect(second).not.toBe(first)
      const firstSnapshot = await readSnapshot(rootDir, 'snippet', 'staging', first)
      expect(firstSnapshot.beforeState).toEqual({a: 'first'})
    } finally {
      vi.spyOn(Date, 'now').mockRestore()
    }
  })
})
