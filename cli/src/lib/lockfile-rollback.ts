// `lps plugin rollback`, `lps theme version rollback` and `lps composer rollback`: the three
// pushes that go through the site's Composer (`loopress/v1/composer/sync`). Their snapshot is the
// site's installed set, read before and right after the push (PushCommand.writeAfterPushSnapshot),
// and restoring it syncs Composer back to the earlier versions. The intent replaces its whole
// section on the server (ComposerService::renderComposerJson), so a package the push added is
// uninstalled: these rollbacks mirror the snapshot.

import {type InstalledPlugin, type WpNativePlugin} from '../types/plugin.js'
import {parseComposerJson, requireToInstall, toIntent} from '../utils/composer.js'
import {isDowngrade, parseCollisions, SYNC_TIMEOUT_MS, type SyncIntent, type SyncResponse} from '../utils/plugin-sync.js'
import {parseInstalledPlugins, preferredCopy} from '../utils/plugins.js'
import {pluralize} from '../utils/pluralize.js'
import {parseInstalledThemes, type WpNativeTheme} from '../utils/themes.js'
import {type ResourceState} from './diff-state.js'
import {isRecord} from './narrow.js'
import {composerRemoteState, type ResourceStateProvider} from './resource-state.js'
import {type RollbackDowngrades, type RollbackRestore} from './rollback-command.js'
import {isLocalEnvironment, isNotFoundError, type WpClient} from './wp-client.js'

// One installed plugin or theme. `locked`: the version in the site's composer.lock, present only
// for a package Loopress manages. `active`: plugins only, `theme version push` never switches the
// active theme, so its rollback doesn't either.
type PackageEntry = {active?: boolean; locked?: string; version: string}

const COMPOSER_LOCK_ENDPOINT = 'loopress/v1/composer/lock'

async function fetchLock(wp: WpClient): Promise<null | string> {
  try {
    const {composerLock} = await wp.get<{composerLock: string}>(COMPOSER_LOCK_ENDPOINT)
    return composerLock
  } catch (error) {
    if (isNotFoundError(error)) return null
    throw error
  }
}

// name -> version of every package in a composer.lock (`packages` and `packages-dev`), the
// names starting with `prefix` only, with the prefix removed.
export function lockedVersions(composerLock: unknown, prefix = ''): Map<string, string> {
  const versions = new Map<string, string>()
  if (typeof composerLock !== 'string' || composerLock === '') return versions

  let parsed: unknown
  try {
    parsed = JSON.parse(composerLock)
  } catch {
    return versions
  }

  if (!isRecord(parsed)) return versions
  for (const key of ['packages', 'packages-dev']) {
    const packages = parsed[key]
    if (!Array.isArray(packages)) continue
    for (const item of packages as unknown[]) {
      if (isRecord(item) && typeof item.name === 'string' && typeof item.version === 'string' && item.name.startsWith(prefix)) {
        versions.set(item.name.slice(prefix.length), item.version)
      }
    }
  }

  return versions
}

function entryOf(value: unknown): PackageEntry | undefined {
  if (!isRecord(value) || typeof value.version !== 'string') return undefined
  return {
    ...(typeof value.active === 'boolean' && {active: value.active}),
    ...(typeof value.locked === 'string' && {locked: value.locked}),
    version: value.version,
  }
}

function entry(version: string, locked: string | undefined, active?: boolean): PackageEntry {
  return {...(active !== undefined && {active}), ...(locked !== undefined && {locked}), version}
}

export async function pluginLockState(wp: WpClient): Promise<ResourceState> {
  const installed = parseInstalledPlugins(await wp.get<WpNativePlugin[]>('wp/v2/plugins'))
  const locked = lockedVersions(await fetchLock(wp), 'wpackagist-plugin/')
  const state: ResourceState = new Map()
  for (const slug of new Set(installed.map((plugin) => plugin.slug))) {
    const copy = preferredCopy(installed.filter((plugin) => plugin.slug === slug), slug)
    if (copy) state.set(slug, entry(copy.version, locked.get(slug), copy.active))
  }

  return state
}

export async function themeLockState(wp: WpClient): Promise<ResourceState> {
  const installed = parseInstalledThemes(await wp.get<WpNativeTheme[]>('wp/v2/themes'))
  const locked = lockedVersions(await fetchLock(wp), 'wpackagist-theme/')
  return new Map(installed.map((theme) => [theme.slug, entry(theme.version, locked.get(theme.slug))]))
}

function remoteOnly(title: string): ResourceStateProvider['local'] {
  return async () => {
    throw new Error(`${title} are only compared on the site.`)
  }
}

// Not in RESOURCE_STATE_PROVIDERS: `lps diff` compares no local directory for them. `dirKind`
// only satisfies the type, the rollback reads no local file.
export const pluginLockProvider: ResourceStateProvider = {
  dirKind: 'options',
  local: remoteOnly('Plugins'),
  remote: async (wp) => pluginLockState(wp),
  resource: 'plugin',
  title: 'Plugins',
}

export const themeLockProvider: ResourceStateProvider = {
  dirKind: 'themeStyles',
  local: remoteOnly('Theme versions'),
  remote: async (wp) => themeLockState(wp),
  resource: 'theme-version',
  title: 'Theme versions',
}

export const composerProvider: ResourceStateProvider = {
  dirKind: 'options',
  local: remoteOnly('composer.json and composer.lock'),
  remote: async (wp) => composerRemoteState(wp),
  resource: 'composer',
  title: 'Composer dependencies',
}

function currentLocked(current: ResourceState): Map<string, string> {
  const locked = new Map<string, string>()
  for (const [slug, value] of current) {
    const parsed = entryOf(value)
    if (parsed?.locked) locked.set(slug, parsed.locked)
  }

  return locked
}

// The Composer section to sync: each package the snapshot had managed, at its locked version.
// A package installed outside Loopress before the push and taken over by it (`--force`) stays
// managed, at the version it had: dropping it would uninstall it, its earlier files are gone.
export function restoreIntent(beforeState: Record<string, unknown>, current: ResourceState): Record<string, string> {
  const locked = currentLocked(current)
  const intent: Record<string, string> = {}
  for (const [slug, value] of Object.entries(beforeState)) {
    const parsed = entryOf(value)
    if (!parsed) continue
    if (parsed.locked) intent[slug] = parsed.locked
    else if (locked.has(slug)) intent[slug] = parsed.version
  }

  return intent
}

function downgradesTo(current: Map<string, string>, target: Map<string, string>): string[] {
  return [...target]
    .filter(([name, version]) => {
      const from = current.get(name)
      return from !== undefined && isDowngrade(from, version)
    })
    .map(([name, version]) => `${name} ${current.get(name)} to ${version}`)
}

export const packageDowngrades: RollbackDowngrades = ({current, snapshot}) => {
  const intent = restoreIntent(snapshot.beforeState, current)
  return downgradesTo(currentLocked(current), new Map(Object.entries(intent)))
}

export const composerDowngrades: RollbackDowngrades = ({current, snapshot}) =>
  downgradesTo(lockedVersions(current.get('composer.lock')), lockedVersions(snapshot.beforeState['composer.lock']))

async function sync(wp: WpClient, intent: SyncIntent, force: boolean, lock: null | string = null): Promise<SyncResponse> {
  try {
    return await wp.post<SyncResponse>('loopress/v1/composer/sync', {force, intent, lock}, {timeoutMs: SYNC_TIMEOUT_MS})
  } catch (error) {
    const collisions = parseCollisions(error)
    if (collisions) {
      throw new Error(
        `The site rejected the rollback: ${collisions.map((c) => c.slug).join(', ')} installed outside Loopress. Re-run with --force to take ${collisions.length === 1 ? 'it' : 'them'} over.`,
        {cause: error},
      )
    }

    throw error
  }
}

function sameMap(a: Map<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(b)
  return a.size === keys.length && keys.every((key) => a.get(key) === b[key])
}

type RestoreContext = Parameters<RollbackRestore>[0]

// Syncs `section` back to the snapshot, when its managed set differs from now. Returns whether
// Composer ran.
async function syncSection(context: RestoreContext, section: 'plugins' | 'themes', intent: Record<string, string>): Promise<boolean> {
  if (sameMap(currentLocked(context.current), intent)) return false
  context.log('Running Composer on the server, this can take a few minutes...')
  const response = await sync(context.wp, {[section]: intent}, context.force)
  if (response.output.trim()) context.log(response.output.trim())
  return true
}

async function setPluginStatus(wp: WpClient, log: (message: string) => void, plugin: InstalledPlugin, active: boolean): Promise<void> {
  log(active ? `  ⊙ activating ${plugin.slug}` : `  ⊘ deactivating ${plugin.slug}`)
  await wp.put(`wp/v2/plugins/${plugin.file}`, {status: active ? 'active' : 'inactive'})
}

// WordPress refuses to activate a plugin whose `Requires Plugins` are inactive, and the snapshot
// has no dependency order: a refused plugin is retried after the others, until a round
// activates nothing (the same loop as `plugin push`).
async function activateAll(wp: WpClient, log: (message: string) => void, plugins: InstalledPlugin[]): Promise<void> {
  let pending = plugins
  while (pending.length > 0) {
    const failed: Array<{error: unknown; plugin: InstalledPlugin}> = []
    for (const plugin of pending) {
      try {
        await setPluginStatus(wp, log, plugin, true)
      } catch (error) {
        failed.push({error, plugin})
      }
    }

    const [first] = failed
    if (first && failed.length === pending.length) throw first.error
    pending = failed.map(({plugin}) => plugin)
  }
}

export const restorePlugins: RollbackRestore = async (context) => {
  const {current, log, snapshot, warn, wp} = context
  const intent = restoreIntent(snapshot.beforeState, current)
  const locked = currentLocked(current)

  // A plugin whose folder Composer is about to delete or replace is switched off first, so the
  // site does not fatal between the removal and the install (the same as `plugin push`).
  const installed = parseInstalledPlugins(await wp.get<WpNativePlugin[]>('wp/v2/plugins'))
  const endangered = new Set([...locked].filter(([slug, version]) => intent[slug] !== version).map(([slug]) => slug))
  const switchedOff = sameMap(locked, intent) ? [] : installed.filter((plugin) => plugin.active && endangered.has(plugin.slug))
  for (const plugin of switchedOff) await setPluginStatus(wp, log, plugin, false)

  try {
    await syncSection(context, 'plugins', intent)
  } catch (error) {
    // The file swap never happened: put back the plugins switched off for it.
    await activateAll(wp, log, switchedOff)
    throw error
  }

  await restoreActiveStates(context, intent)

  const kept = [...current.keys()].filter((slug) => !Object.hasOwn(snapshot.beforeState, slug) && !locked.has(slug))
  if (kept.length > 0) warn(`Installed outside Loopress since that push, left as they are: ${kept.join(', ')}.`)
}

// Each plugin of the snapshot back to its active state, once Composer has put its version back.
async function restoreActiveStates({log, snapshot, warn, wp}: RestoreContext, intent: Record<string, string>): Promise<void> {
  const after = parseInstalledPlugins(await wp.get<WpNativePlugin[]>('wp/v2/plugins'))
  const toActivate: InstalledPlugin[] = []
  for (const [slug, value] of Object.entries(snapshot.beforeState)) {
    const parsed = entryOf(value)
    if (!parsed) continue
    const copy = preferredCopy(after.filter((plugin) => plugin.slug === slug), slug)
    if (!copy) {
      warn(
        intent[slug] === undefined
          ? `${slug} could not be put back: it was installed outside Loopress, reinstall it by hand.`
          : `${slug} is not installed after the Composer run, check \`lps plugin status\`.`,
      )
      continue
    }

    if (parsed.active === true && !copy.active) toActivate.push(copy)
    if (parsed.active === false && copy.active) await setPluginStatus(wp, log, copy, false)
  }

  await activateAll(wp, log, toActivate)
}

export const restoreThemes: RollbackRestore = async (context) => {
  const {current, snapshot, warn, wp} = context
  const intent = restoreIntent(snapshot.beforeState, current)

  // Uninstalling the theme WordPress renders leaves the site with no theme, a hard fatal: the
  // same refusal as `theme version push`, --force does not override it.
  const installed = parseInstalledThemes(await wp.get<WpNativeTheme[]>('wp/v2/themes'))
  const active = installed.find((theme) => theme.active && currentLocked(current).has(theme.slug) && intent[theme.slug] === undefined)
  if (active) {
    throw new Error(
      `Refusing to uninstall "${active.slug}": it is the site's active theme. Switch the site to another theme, then roll back again.`,
    )
  }

  await syncSection(context, 'themes', intent)

  const after = new Set(parseInstalledThemes(await wp.get<WpNativeTheme[]>('wp/v2/themes')).map((theme) => theme.slug))
  const missing = Object.keys(snapshot.beforeState).filter((slug) => !after.has(slug))
  if (missing.length > 0) warn(`Installed outside Loopress, could not be put back: ${missing.join(', ')}. Reinstall them by hand.`)
}

// The site's composer.json comes back from the snapshot and Composer runs on it. The server
// never installs from a lock the CLI sends (ComposerService::sync, a crafted lock could fetch
// code from any host): the snapshot's composer.lock goes along only to report which packages
// resolved to another version than it pinned.
export const restoreComposer: RollbackRestore = async ({environment, force, log, snapshot, warn, wp}) => {
  const composerJson = snapshot.beforeState['composer.json']
  if (typeof composerJson !== 'string') throw new Error('The snapshot has no composer.json.')
  const lock = snapshot.beforeState['composer.lock']
  const require = requireToInstall(parseComposerJson(composerJson), isLocalEnvironment(environment))

  log('Running Composer on the server, this can take a few minutes...')
  const response = await sync(wp, toIntent(require), force, typeof lock === 'string' ? lock : null)
  if (response.output.trim()) log(response.output.trim())

  const drift = (response.lockDrift ?? []).map(({from, name, to}) => `${name} ${from ?? '(absent)'} -> ${to ?? '(removed)'}`)
  if (drift.length > 0) {
    warn(
      `Composer resolved ${pluralize(drift.length, 'package')} to another version than the snapshot's composer.lock: ` +
        `${drift.join(', ')}. Pin the versions in composer.json and push to get them back exactly.`,
    )
  }
}
