import {InstalledPlugin, PluginManifest, WpNativePlugin} from '../types/plugin.js'

export interface PluginDiff {
  toActivate: Array<{file: string; slug: string}>
  toInstall: Array<{slug: string}>
  upToDate: string[]
}

export interface MergeResult {
  added: string[]
  merged: PluginManifest
  updated: Array<{from: string; slug: string; to: string}>
}

// Loopress must never manage itself: pulling it into loopress.json would make a later
// `plugin push` try to reinstall it from WordPress.org, where it doesn't exist, potentially
// clobbering the plugin's own directory in the process.
const LOOPRESS_PLUGIN_SLUG = 'loopress'

export function mergePluginManifest(existing: PluginManifest, incoming: PluginManifest): MergeResult {
  const merged = {...existing, ...incoming}

  const added = Object.keys(incoming).filter((s) => !(s in existing))
  const updated = Object.keys(incoming)
    .filter((s) => s in existing && existing[s] !== incoming[s])
    .map((s) => ({from: existing[s], slug: s, to: incoming[s]}))

  return {added, merged, updated}
}

// WordPress core identifies each plugin by a `<folder>/<file>` id (or a bare `<file>` for a
// single-file plugin) with the `.php` extension stripped; the WordPress.org slug is just the
// folder name (or the bare id itself for a single-file plugin).
function slugFromPluginFile(file: string): string {
  return file.split('/')[0]
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
    .filter((plugin) => plugin.slug !== LOOPRESS_PLUGIN_SLUG)
}

export function diffPlugins(manifest: PluginManifest, installed: InstalledPlugin[]): PluginDiff {
  const installedMap = new Map(installed.map((p) => [p.slug, p]))

  const toInstall: PluginDiff['toInstall'] = []
  const toActivate: PluginDiff['toActivate'] = []
  const upToDate: string[] = []

  for (const slug of Object.keys(manifest)) {
    const live = installedMap.get(slug)

    if (!live) {
      toInstall.push({slug})
    } else if (live.active) {
      upToDate.push(slug)
    } else {
      toActivate.push({file: live.file, slug})
    }
  }

  return {toActivate, toInstall, upToDate}
}
