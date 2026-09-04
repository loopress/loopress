import {type InstalledPlugin, type PluginManifest, type WpNativePlugin} from '../types/plugin.js'

export type PluginDiff = {
  // In the manifest and installed, but the folder isn't tracked in composer.lock: it was
  // installed by hand through wp-admin. Composer can't cleanly install over it; `--force`
  // lets Loopress remove and reinstall it.
  collisions: Array<{installedVersion: string; slug: string}>
  inSync: string[]
  toActivate: Array<{file: string; slug: string}>
  toInstall: Array<{slug: string; version: string}>
  // Installed at a version that doesn't match the pinned one (never reported for "latest").
  toPin: Array<{from: string; slug: string; to: string}>
  // Managed by Loopress (present in composer.lock) but dropped from the manifest: the next
  // push removes it from composer.json, so `composer update` uninstalls it from the site.
  toRemove: string[]
  // Active on the site, absent from both the manifest and composer.lock: `--prune` deactivates
  // these, `status` reports them.
  untrackedActive: string[]
}

export type MergeResult = {
  added: string[]
  merged: PluginManifest
  updated: Array<{from: string; slug: string; to: string}>
}

// Loopress must never manage itself: pulling it into loopress.json would make a later
// `plugin push` try to reinstall it from WordPress.org, where it doesn't exist, potentially
// clobbering the plugin's own directory in the process. Checked against every slug this
// plugin has ever shipped under (pre-rename "loopress", and the current "loopress-full" /
// "loopress-light" editions), since a given site could be running any of them.
const LOOPRESS_PLUGIN_SLUGS = new Set(['loopress', 'loopress-full', 'loopress-light'])

export function mergePluginManifest(existing: PluginManifest, incoming: PluginManifest): MergeResult {
  const merged = {...existing, ...incoming}

  const added = Object.keys(incoming).filter((s) => !Object.hasOwn(existing, s))
  const updated = Object.keys(incoming)
    .filter((s) => Object.hasOwn(existing, s) && existing[s] !== incoming[s])
    .map((s) => ({from: existing[s], slug: s, to: incoming[s]}))

  return {added, merged, updated}
}

// WordPress core identifies each plugin by a `<folder>/<file>` id (or a bare `<file>` for a
// single-file plugin) with the `.php` extension stripped; the WordPress.org slug is just the
// folder name (or the bare id itself for a single-file plugin). Composer + composer/installers
// installs a WPackagist plugin into `wp-content/plugins/<slug>/`, so folder name and slug stay
// aligned for anything Loopress manages.
function slugFromPluginFile(file: string): string {
  return file.split('/', 1)[0]
}

export function parseInstalledPlugins(raw: WpNativePlugin[]): InstalledPlugin[] {
  return raw
    .map((item) => ({
      active: item.status !== 'inactive',
      file: item.plugin,
      name: item.name,
      slug: slugFromPluginFile(item.plugin),
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
  const collisions: PluginDiff['collisions'] = []
  const inSync: string[] = []

  for (const [slug, wanted] of Object.entries(manifest)) {
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

    if (wanted !== 'latest' && live.version !== wanted) {
      toPin.push({from: live.version, slug, to: wanted})
      continue
    }

    if (!live.active) {
      toActivate.push({file: live.file, slug})
      continue
    }

    inSync.push(slug)
  }

  const toRemove = [...managedSlugs].filter((slug) => !Object.hasOwn(manifest, slug))

  const untrackedActive = installed
    .filter((p) => p.active && !Object.hasOwn(manifest, p.slug) && !managedSlugs.has(p.slug))
    .map((p) => p.slug)

  return {collisions, inSync, toActivate, toInstall, toPin, toRemove, untrackedActive}
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
