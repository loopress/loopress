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

export type PluginManifest = Record<string, string>
