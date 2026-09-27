export type InstalledPlugin = {
  active: boolean
  file: string
  name: string
  slug: string
  version: string
}

// Shape of an item returned by WordPress core's native `wp/v2/plugins` REST endpoint.
export type WpNativePlugin = {
  name: string
  plugin: string
  plugin_uri: string
  status: 'active' | 'inactive' | 'network-active'
  version: string
}

// A bare version string means "installed and active"; the object form records a plugin that
// must stay installed but inactive.
export type PluginPin = string | {active?: boolean; version: string}

export type PluginManifest = Record<string, PluginPin>

export const pinVersion = (pin: PluginPin): string => (typeof pin === 'string' ? pin : pin.version)

export const pinActive = (pin: PluginPin): boolean => typeof pin === 'string' || pin.active !== false

// The version-only view the Composer sync endpoint expects.
export const pinVersions = (manifest: PluginManifest): Record<string, string> =>
  Object.fromEntries(Object.entries(manifest).map(([slug, pin]) => [slug, pinVersion(pin)]))
