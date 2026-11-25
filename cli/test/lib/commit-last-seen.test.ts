import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {LoopressCommand} from '../../src/lib/base.js'
import {readLastSeen, writeLastSeen} from '../../src/lib/last-seen.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

// The site's ACF content, every type at once, as the provider's remote read returns it.
const site = vi.hoisted(() => ({state: new Map<string, unknown>()}))
vi.mock('../../src/lib/resource-state.js', () => ({
  getResourceStateProvider: () => ({remote: async () => site.state}),
}))

class TestCommand extends LoopressCommand {
  async pullAcfType(type: string, keys: string[]): Promise<void> {
    await this.findPullOrphans('acf', this.rootDir, new Set(keys), {extensions: ['.json'], key: (name) => name}, `${type}/`)
    await this.commitLastSeen(this.rootDir)
  }

  async run(): Promise<void> {}
}

describe('commitLastSeen', () => {
  let rootDir: string

  function make(): TestCommand {
    const cmd = new TestCommand([], fakeOclifConfig)
    const internals = cmd as unknown as {localConfig: {rootDir: string}; siteConfig: unknown; wpClient: unknown}
    internals.localConfig = {rootDir}
    internals.siteConfig = makeEnv('test', 'https://acme.com')
    internals.wpClient = {}
    silenceLogs(cmd)
    return cmd
  }

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'lps-commit-last-seen-test-'))
    site.state = new Map<string, unknown>([
      ['field_group/group_a', {title: 'A'}],
      ['post_type/book', {label: 'Book'}],
    ])
  })

  afterEach(() => {
    rmSync(rootDir, {force: true, recursive: true})
  })

  // A first pull limited to one type, then a push of every type: the other types need a baseline,
  // or the push guard takes each of their ids for an item created outside Loopress.
  it('records every type on the first record, the keys of the pulled type only', async () => {
    await make().pullAcfType('field_group', ['group_a'])

    const recorded = await readLastSeen(rootDir, 'acf', 'test')
    expect([...(recorded?.keys ?? [])]).toEqual(['field_group/group_a'])
    expect(recorded?.state).toEqual(site.state)
  })

  it('keeps the recorded baseline of the types a later pull did not cover', async () => {
    await writeLastSeen(rootDir, 'acf', 'test', {
      keys: ['field_group/group_a', 'post_type/book'],
      state: new Map<string, unknown>([
        ['field_group/group_a', {title: 'A'}],
        ['post_type/book', {label: 'Book'}],
      ]),
    })
    site.state = new Map<string, unknown>([
      ['field_group/group_a', {title: 'A2'}],
      ['post_type/book', {label: 'Edited in wp-admin'}],
    ])

    await make().pullAcfType('field_group', ['group_a'])

    expect((await readLastSeen(rootDir, 'acf', 'test'))?.state).toEqual(
      new Map<string, unknown>([
        ['field_group/group_a', {title: 'A2'}],
        ['post_type/book', {label: 'Book'}],
      ]),
    )
  })
})
