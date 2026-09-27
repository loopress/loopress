import {
  type InstalledPlugin,
  pinActive,
  pinVersion,
  type PluginManifest,
  type PluginPin,
  type WpNativePlugin,
} from '../types/plugin.js'
import {isExactVersion} from './version.js'

export type PluginDiff = {
  // In the manifest and installed, but the folder isn't tracked in composer.lock: it was
  // installed by hand through wp-admin. Composer can't cleanly install over it; `--force`
  // lets Loopress remove and reinstall it.
  collisions: Array<{installedVersion: string; slug: string}>
  inSync: string[]
  toActivate: Array<{file: string; slug: string}>
  // Pinned with "active": false but active on the site.
  toDeactivate: Array<{file: string; slug: string}>
  toInstall: Array<{slug: string; version: string}>
  // Installed at a version that doesn't match the pinned one (never reported for "latest" or a
  // Composer constraint like ^9.4, which can't be compared to one installed version).
  toPin: Array<{from: string; slug: string; to: string}>
  // Managed by Loopress (present in composer.lock) but dropped from the manifest: the next
  // push removes it from composer.json, so `composer update` uninstalls it from the site.
  toRemove: string[]
  // Active on the site, absent from both the manifest and composer.lock: `--prune` deactivates
  // these, `status` reports them.
  untrackedActive: string[]
}

export type MergeResult<P extends PluginPin = PluginPin> = {
  added: string[]
  merged: Record<string, P>
  updated: Array<{from: string; slug: string; to: string}>
}

// "1.7.2", or "1.7.2 (inactive)" for a pin that keeps the plugin inactive.
export function describePin(pin: PluginPin): string {
  return pinActive(pin) ? pinVersion(pin) : `${pinVersion(pin)} (inactive)`
}

// Loopress must never manage itself: pulling it into loopress.json would make a later
// `plugin push` try to reinstall it from WordPress.org, where it doesn't exist, potentially
// clobbering the plugin's own directory in the process. Checked against every slug this
// plugin has ever shipped under (pre-rename "loopress", and the current "loopress-full" /
// "loopress-light" editions), since a given site could be running any of them.
const LOOPRESS_PLUGIN_SLUGS = new Set(['loopress', 'loopress-full', 'loopress-light'])

export function mergePluginManifest<P extends PluginPin>(
  existing: Record<string, P>,
  incoming: Record<string, P>,
): MergeResult<P> {
  const merged = {...existing, ...incoming}

  const added = Object.keys(incoming).filter((s) => !Object.hasOwn(existing, s))
  const updated = Object.keys(incoming)
    .filter((s) => Object.hasOwn(existing, s) && describePin(existing[s]) !== describePin(incoming[s]))
    .map((s) => ({from: describePin(existing[s]), slug: s, to: describePin(incoming[s])}))

  return {added, merged, updated}
}

// WordPress core identifies each plugin by a `<folder>/<file>` id (or a bare `<file>` for a
// single-file plugin) with the `.php` extension stripped; the WordPress.org slug is just the
// folder name (or the bare id itself for a single-file plugin). Composer + composer/installers
// installs a WPackagist plugin into `wp-content/plugins/<slug>/`, so folder name and slug stay
// aligned for anything Loopress manages.
//
// A single-file plugin's bare id isn't always its real slug though: Hello Dolly ships as
// `hello.php` but its WordPress.org (and WPackagist) slug is `hello-dolly`. When that happens,
// trust the plugin's own `Plugin URI` header over the guessed id.
const WP_ORG_PLUGIN_URI = /^https?:\/\/wordpress\.org\/plugins\/([^/]+)\/?$/

function slugFromPluginFile(file: string, pluginUri: string): string {
  if (file.includes('/')) return file.split('/', 1)[0]
  return WP_ORG_PLUGIN_URI.exec(pluginUri)?.[1] ?? file
}

export function parseInstalledPlugins(raw: WpNativePlugin[]): InstalledPlugin[] {
  return raw
    .map((item) => ({
      active: item.status !== 'inactive',
      file: item.plugin,
      name: item.name,
      slug: slugFromPluginFile(item.plugin, item.plugin_uri),
      version: item.version,
    }))
    .filter((plugin) => !LOOPRESS_PLUGIN_SLUGS.has(plugin.slug))
}

export function diffPlugins(
  manifest: PluginManifest,
  installed: InstalledPlugin[],
  // Slugs Loopress currently manages, from the local composer.lock's wpackagist-plugin/*
  // entries. Empty for a loopress.json-only project that doesn't keep a lockfile in the repo:
  // `toRemove` then stays empty (removals still happen server-side, they just aren't previewed).
  managedSlugs = new Set<string>(),
): PluginDiff {
  const installedMap = new Map(installed.map((p) => [p.slug, p]))

  const toInstall: PluginDiff['toInstall'] = []
  const toPin: PluginDiff['toPin'] = []
  const toActivate: PluginDiff['toActivate'] = []
  const toDeactivate: PluginDiff['toDeactivate'] = []
  const collisions: PluginDiff['collisions'] = []
  const inSync: string[] = []

  for (const [slug, pin] of Object.entries(manifest)) {
    const wanted = pinVersion(pin)
    const live = installedMap.get(slug)

    if (!live) {
      toInstall.push({slug, version: wanted})
      continue
    }

    // Installed, but Loopress doesn't own the folder yet: nothing else can be done with it
    // until `--force` lets Composer take it over.
    if (!managedSlugs.has(slug)) {
      collisions.push({installedVersion: live.version, slug})
      continue
    }

    if (isExactVersion(wanted) && live.version !== wanted) {
      toPin.push({from: live.version, slug, to: wanted})
      continue
    }

    if (live.active !== pinActive(pin)) {
      ;(live.active ? toDeactivate : toActivate).push({file: live.file, slug})
      continue
    }

    inSync.push(slug)
  }

  const toRemove = [...managedSlugs].filter((slug) => !Object.hasOwn(manifest, slug))

  const untrackedActive = installed
    .filter((p) => p.active && !Object.hasOwn(manifest, p.slug) && !managedSlugs.has(p.slug))
    .map((p) => p.slug)

  return {collisions, inSync, toActivate, toDeactivate, toInstall, toPin, toRemove, untrackedActive}
}

// wpackagist-plugin/<slug> or wpackagist-theme/<slug> entries from a composer.lock string.
export function lockedWpackagistSlugs(composerLock: null | string, kind: 'plugin' | 'theme'): Set<string> {
  if (!composerLock) return new Set()

  const prefix = `wpackagist-${kind}/`
  try {
    const parsed = JSON.parse(composerLock) as {packages?: Array<{name?: string}>}
    return new Set(
      (parsed.packages ?? [])
        .map((p) => p.name ?? '')
        .filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length)),
    )
  } catch {
    return new Set()
  }
}
