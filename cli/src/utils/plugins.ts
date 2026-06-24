import {InstalledPlugin, PluginManifest} from '../types/plugin.js'

export interface PluginDiff {
  drifted: Array<{currentVersion: string; slug: string; targetVersion: string}>
  toInstall: Array<{slug: string; targetVersion: string}>
  upToDate: string[]
}

export interface MergeResult {
  added: string[]
  merged: PluginManifest
  updated: Array<{from: string; slug: string; to: string}>
}

export function mergePluginManifest(existing: PluginManifest, incoming: PluginManifest): MergeResult {
  const merged = {...existing, ...incoming}

  const added = Object.keys(incoming).filter((s) => !(s in existing))
  const updated = Object.keys(incoming)
    .filter((s) => s in existing && existing[s] !== incoming[s])
    .map((s) => ({from: existing[s], slug: s, to: incoming[s]}))

  return {added, merged, updated}
}

export function diffPlugins(manifest: PluginManifest, installed: InstalledPlugin[]): PluginDiff {
  const installedMap = new Map(installed.map((p) => [p.slug, p]))

  const toInstall: PluginDiff['toInstall'] = []
  const drifted: PluginDiff['drifted'] = []
  const upToDate: string[] = []

  for (const [slug, targetVersion] of Object.entries(manifest)) {
    const live = installedMap.get(slug)

    if (!live) {
      toInstall.push({slug, targetVersion})
      continue
    }

    if (live.version !== targetVersion) {
      drifted.push({currentVersion: live.version, slug, targetVersion})
    } else {
      upToDate.push(slug)
    }
  }

  return {drifted, toInstall, upToDate}
}
