// Themes are version-managed only: Loopress never switches the active theme (that can break a
// live site hard), so unlike plugins there is no activate / prune dimension here.

export type WpNativeTheme = {
  status: 'active' | 'inactive'
  stylesheet: string
  version: string
}

export type InstalledTheme = {
  active: boolean
  slug: string
  version: string
}

export type ThemeManifest = Record<string, string>

export type ThemeDiff = {
  collisions: Array<{installedVersion: string; slug: string}>
  inSync: string[]
  toInstall: Array<{slug: string; version: string}>
  toPin: Array<{from: string; slug: string; to: string}>
  toRemove: string[]
}

export function parseInstalledThemes(raw: WpNativeTheme[]): InstalledTheme[] {
  return raw.map((t) => ({active: t.status === 'active', slug: t.stylesheet, version: t.version}))
}

export function diffThemes(
  manifest: ThemeManifest,
  installed: InstalledTheme[],
  managedSlugs = new Set<string>(),
): ThemeDiff {
  const map = new Map(installed.map((t) => [t.slug, t]))
  const toInstall: ThemeDiff['toInstall'] = []
  const toPin: ThemeDiff['toPin'] = []
  const collisions: ThemeDiff['collisions'] = []
  const inSync: string[] = []

  for (const [slug, wanted] of Object.entries(manifest)) {
    const live = map.get(slug)
    if (!live) {
      toInstall.push({slug, version: wanted})
    } else if (!managedSlugs.has(slug)) {
      collisions.push({installedVersion: live.version, slug})
    } else if (wanted !== 'latest' && live.version !== wanted) {
      toPin.push({from: live.version, slug, to: wanted})
    } else {
      inSync.push(slug)
    }
  }

  const toRemove = [...managedSlugs].filter((slug) => !Object.hasOwn(manifest, slug))

  return {collisions, inSync, toInstall, toPin, toRemove}
}
