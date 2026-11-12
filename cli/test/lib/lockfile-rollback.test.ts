import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import ComposerRollback from '../../src/commands/composer/rollback.js'
import PluginRollback from '../../src/commands/plugin/rollback.js'
import ThemeVersionRollback from '../../src/commands/theme/version/rollback.js'
import {type LoopressCommand} from '../../src/lib/base.js'
import {lockedVersions} from '../../src/lib/lockfile-rollback.js'
import {type CommandClass} from '../../src/lib/php-files-command.js'
import {type RollbackResult} from '../../src/lib/rollback-command.js'
import {writeSnapshot} from '../../src/lib/snapshot-store.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

vi.mock('../../src/lib/interactive.js', () => ({isInteractive: () => false}))

type Rollback = CommandClass<Omit<LoopressCommand, 'run'> & {run(): Promise<RollbackResult>}>

const lock = (packages: Record<string, string>) =>
  JSON.stringify({packages: Object.entries(packages).map(([name, version]) => ({name, version}))})

const native = (slug: string, version: string, active: boolean) => ({
  name: slug,
  plugin: `${slug}/${slug}.php`,
  plugin_uri: '',
  status: active ? 'active' : 'inactive',
  version,
})

// A site whose answers switch to `after` once Composer ran.
function site(before: {lock: string; plugins?: unknown[]; themes?: unknown[]}, after: {lock: string; plugins?: unknown[]; themes?: unknown[]}) {
  let synced = false
  const current = () => (synced ? after : before)
  const get = vi.fn(async (path: string) => {
    if (path === 'loopress/v1/composer/lock') return {composerLock: current().lock}
    if (path === 'wp/v2/plugins') return current().plugins ?? []
    if (path === 'wp/v2/themes') return current().themes ?? []
    throw new Error(`unexpected GET ${path}`)
  })
  const post = vi.fn(async () => {
    synced = true
    return {composerJson: '{}', composerLock: after.lock, message: 'ok', output: '', removed: []}
  })
  const put = vi.fn().mockResolvedValue({})
  return {get, post, put}
}

describe('lockfile rollbacks', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'lps-lockfile-rollback-test-'))
    resetFakeOclifConfig()
  })

  afterEach(() => {
    rmSync(rootDir, {force: true, recursive: true})
  })

  function make(Command: unknown, wp: Record<string, unknown>, argv: string[] = [], dryRun = false) {
    const cmd = new (Command as Rollback)(argv, fakeOclifConfig)
    silenceLogs(cmd)
    const warn = vi.fn()
    Object.assign(cmd, {dryRun, localConfig: {rootDir}, siteConfig: makeEnv('staging'), warn, wpClient: wp, yes: false})
    return {cmd, warn}
  }

  it('reads every locked package, dev ones included', () => {
    const raw = JSON.stringify({'packages': [{name: 'wpackagist-plugin/akismet', version: '5.3'}], 'packages-dev': [{name: 'wpackagist-plugin/query-monitor', version: '3.16'}]})
    expect(lockedVersions(raw, 'wpackagist-plugin/')).toEqual(new Map([['akismet', '5.3'], ['query-monitor', '3.16']]))
    expect(lockedVersions('not json')).toEqual(new Map())
  })

  it('plugin: uninstalls the plugin the push added, reinstalls and reactivates the one it removed', async () => {
    const beforeState = new Map([
      ['akismet', {active: true, locked: '5.3', version: '5.3'}],
      ['redirection', {active: true, locked: '5.4', version: '5.4'}],
    ])
    const afterState = new Map([
      ['akismet', {active: true, locked: '5.3', version: '5.3'}],
      ['wordfence', {active: true, locked: '8.0', version: '8.0'}],
    ])
    await writeSnapshot({afterState, beforeState, environment: 'staging', resource: 'plugin', rootDir})
    const wp = site(
      {lock: lock({'wpackagist-plugin/akismet': '5.3', 'wpackagist-plugin/wordfence': '8.0'}), plugins: [native('akismet', '5.3', true), native('wordfence', '8.0', true)]},
      {lock: lock({'wpackagist-plugin/akismet': '5.3', 'wpackagist-plugin/redirection': '5.4'}), plugins: [native('akismet', '5.3', true), native('redirection', '5.4', false)]},
    )
    const {cmd} = make(PluginRollback, wp)

    const result = await cmd.run()

    expect(result.status).toBe('success')
    expect(result.restored).toEqual({added: ['redirection'], changed: [], removed: ['wordfence']})
    expect(wp.post).toHaveBeenCalledWith(
      'loopress/v1/composer/sync',
      {force: false, intent: {plugins: {akismet: '5.3', redirection: '5.4'}}, lock: null},
      expect.anything(),
    )
    // wordfence is switched off before Composer deletes its folder, redirection back on after.
    expect(wp.put.mock.calls).toEqual([
      ['wp/v2/plugins/wordfence/wordfence.php', {status: 'inactive'}],
      ['wp/v2/plugins/redirection/redirection.php', {status: 'active'}],
    ])
  })

  it('plugin: refuses a downgrade without --force, with the migration warning, and only warns on a dry run', async () => {
    const beforeState = new Map([['akismet', {active: true, locked: '5.2', version: '5.2'}]])
    const afterState = new Map([['akismet', {active: true, locked: '5.3', version: '5.3'}]])
    await writeSnapshot({afterState, beforeState, environment: 'staging', resource: 'plugin', rootDir})
    const state = {lock: lock({'wpackagist-plugin/akismet': '5.3'}), plugins: [native('akismet', '5.3', true)]}

    const refused = site(state, state)
    await expect(make(PluginRollback, refused).cmd.run()).rejects.toThrow(/downgrades akismet 5.3 to 5.2.*does not undo database migrations.*--force/s)
    expect(refused.post).not.toHaveBeenCalled()

    const preview = site(state, state)
    const dry = make(PluginRollback, preview, [], true)
    expect((await dry.cmd.run()).status).toBe('dry-run')
    expect(dry.warn).toHaveBeenCalledWith(expect.stringContaining('does not undo database migrations'))
    expect(preview.post).not.toHaveBeenCalled()

    const forced = site(state, {lock: lock({'wpackagist-plugin/akismet': '5.2'}), plugins: [native('akismet', '5.2', true)]})
    expect((await make(PluginRollback, forced, ['--force']).cmd.run()).status).toBe('success')
    expect(forced.post).toHaveBeenCalledWith('loopress/v1/composer/sync', {force: true, intent: {plugins: {akismet: '5.2'}}, lock: null}, expect.anything())
  })

  it('plugin: counts a version updated outside Composer as a downgrade', async () => {
    const beforeState = new Map([['akismet', {active: true, locked: '5.3', version: '5.3'}]])
    // The lock still says 5.3, but the plugin was updated to 6.0 outside Composer.
    const afterState = new Map([['akismet', {active: true, locked: '5.3', version: '6.0'}]])
    await writeSnapshot({afterState, beforeState, environment: 'staging', resource: 'plugin', rootDir})
    const state = {lock: lock({'wpackagist-plugin/akismet': '5.3'}), plugins: [native('akismet', '6.0', true)]}
    const wp = site(state, state)
    const {cmd} = make(PluginRollback, wp)

    await expect(cmd.run()).rejects.toThrow(/downgrades akismet 6.0 to 5.3/)
    expect(wp.post).not.toHaveBeenCalled()
  })

  it('theme version: refuses to take over the active theme installed outside Loopress', async () => {
    await writeSnapshot({
      afterState: new Map([['astra', {version: '4.7'}]]),
      beforeState: new Map([['astra', {locked: '4.6', version: '4.6'}]]),
      environment: 'staging',
      resource: 'theme-version',
      rootDir,
    })
    const state = {lock: lock({}), themes: [{status: 'active', stylesheet: 'astra', version: '4.7'}]}
    const wp = site(state, state)

    await expect(make(ThemeVersionRollback, wp, ['--force']).cmd.run()).rejects.toThrow(/Refusing to take over "astra"/)
    expect(wp.post).not.toHaveBeenCalled()
  })

  it('theme version: reinstalls the removed theme and uninstalls the added one', async () => {
    const beforeState = new Map([['astra', {locked: '4.6', version: '4.6'}], ['twentytwentyfour', {version: '1.0'}]])
    const afterState = new Map([['kadence', {locked: '1.2', version: '1.2'}], ['twentytwentyfour', {version: '1.0'}]])
    await writeSnapshot({afterState, beforeState, environment: 'staging', resource: 'theme-version', rootDir})
    const theme = (stylesheet: string, version: string, active = false) => ({status: active ? 'active' : 'inactive', stylesheet, version})
    const wp = site(
      {lock: lock({'wpackagist-theme/kadence': '1.2'}), themes: [theme('kadence', '1.2'), theme('twentytwentyfour', '1.0', true)]},
      {lock: lock({'wpackagist-theme/astra': '4.6'}), themes: [theme('astra', '4.6'), theme('twentytwentyfour', '1.0', true)]},
    )

    const result = await make(ThemeVersionRollback, wp).cmd.run()

    expect(result.status).toBe('success')
    expect(wp.post).toHaveBeenCalledWith('loopress/v1/composer/sync', {force: false, intent: {themes: {astra: '4.6'}}, lock: null}, expect.anything())
  })

  it('theme version: refuses to uninstall the active theme', async () => {
    await writeSnapshot({
      afterState: new Map([['kadence', {locked: '1.2', version: '1.2'}]]),
      beforeState: new Map(),
      environment: 'staging',
      resource: 'theme-version',
      rootDir,
    })
    const state = {lock: lock({'wpackagist-theme/kadence': '1.2'}), themes: [{status: 'active', stylesheet: 'kadence', version: '1.2'}]}
    const wp = site(state, state)

    await expect(make(ThemeVersionRollback, wp).cmd.run()).rejects.toThrow(/Refusing to uninstall "kadence"/)
    expect(wp.post).not.toHaveBeenCalled()
  })

  it("composer: syncs the snapshot's composer.json and sends its lock for the drift report", async () => {
    const beforeJson = JSON.stringify({require: {'monolog/monolog': '^3.0', 'wpackagist-plugin/akismet': '5.3'}})
    const beforeLock = lock({'monolog/monolog': '3.5.0', 'wpackagist-plugin/akismet': '5.3'})
    const afterJson = JSON.stringify({require: {'guzzlehttp/guzzle': '^7.0', 'wpackagist-plugin/akismet': '5.3'}})
    const afterLock = lock({'guzzlehttp/guzzle': '7.8.0', 'wpackagist-plugin/akismet': '5.3'})
    await writeSnapshot({
      afterState: new Map([['composer.json', afterJson], ['composer.lock', afterLock]]),
      beforeState: new Map([['composer.json', beforeJson], ['composer.lock', beforeLock]]),
      environment: 'staging',
      resource: 'composer',
      rootDir,
    })
    let synced = false
    const get = vi.fn(async (path: string) => {
      if (path === 'loopress/v1/composer/json') return {composerJson: synced ? beforeJson : afterJson}
      if (path === 'loopress/v1/composer/lock') return {composerLock: synced ? beforeLock : afterLock}
      throw new Error(`unexpected GET ${path}`)
    })
    const post = vi.fn(async () => {
      synced = true
      return {composerJson: beforeJson, composerLock: beforeLock, lockDrift: [{from: '3.5.0', name: 'monolog/monolog', to: '3.6.0'}], message: 'ok', output: ''}
    })
    const {cmd, warn} = make(ComposerRollback, {get, post})

    const result = await cmd.run()

    expect(result.status).toBe('success')
    expect(post).toHaveBeenCalledWith(
      'loopress/v1/composer/sync',
      {force: false, intent: {libraries: {'monolog/monolog': '^3.0'}, plugins: {akismet: '5.3'}, themes: {}}, lock: beforeLock},
      expect.anything(),
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('monolog/monolog 3.5.0 -> 3.6.0'))
  })

  it('composer: refuses a downgrade without --force', async () => {
    const json = JSON.stringify({require: {'monolog/monolog': '^3.0'}})
    await writeSnapshot({
      afterState: new Map([['composer.json', json], ['composer.lock', lock({'monolog/monolog': '3.6.0'})]]),
      beforeState: new Map([['composer.json', json], ['composer.lock', lock({'monolog/monolog': '3.5.0'})]]),
      environment: 'staging',
      resource: 'composer',
      rootDir,
    })
    const get = vi.fn(async (path: string) =>
      path === 'loopress/v1/composer/json' ? {composerJson: json} : {composerLock: lock({'monolog/monolog': '3.6.0'})},
    )
    const post = vi.fn()

    await expect(make(ComposerRollback, {get, post}).cmd.run()).rejects.toThrow(/downgrades monolog\/monolog 3.6.0 to 3.5.0/)
    expect(post).not.toHaveBeenCalled()
  })
})
