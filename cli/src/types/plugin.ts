import {z} from 'zod'

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
// Strict: an unknown key is a typo (`activate` for `active`) that would otherwise be dropped.
export const PLUGIN_PIN = z.union([z.string(), z.strictObject({active: z.boolean().exactOptional(), version: z.string()})])

const PIN_KEYS = ['active', 'version']

// Levenshtein distance, enough to tell a typo of a pin key ("activate", "verison") from another key.
function editDistance(a: string, b: string): number {
  let previous = Array.from({length: b.length + 1}, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution))
    }

    previous = current
  }

  return previous[b.length] ?? 0
}

// Why a loopress.json plugin pin is invalid, or undefined when it is fine.
export function pinProblem(slug: string, pin: unknown): string | undefined {
  if (PLUGIN_PIN.safeParse(pin).success) return undefined
  if (pin !== null && typeof pin === 'object' && !Array.isArray(pin)) {
    const unknown = Object.keys(pin).filter((key) => !PIN_KEYS.includes(key))
    if (unknown.length > 0) {
      const hints = unknown.map((key) => {
        const near = PIN_KEYS.find((known) => editDistance(key.toLowerCase(), known) <= 2)
        return near ? `"${key}" (did you mean "${near}"?)` : `"${key}"`
      })
      return `plugin "${slug}" has unknown key(s) ${hints.join(', ')}: a pin is a version string or {version, active}`
    }
  }

  return `plugin "${slug}" must map to a version string or {version, active}`
}

export type PluginPin = z.infer<typeof PLUGIN_PIN>

export type PluginManifest = Record<string, PluginPin>

export const pinVersion = (pin: PluginPin): string => (typeof pin === 'string' ? pin : pin.version)

// No pin at all (a slug loopress.json doesn't list) keeps the default: active.
export const pinActive = (pin: PluginPin | undefined): boolean => typeof pin === 'string' || pin?.active !== false

// The version-only view the Composer sync endpoint expects.
export const pinVersions = (manifest: PluginManifest): Record<string, string> =>
  Object.fromEntries(Object.entries(manifest).map(([slug, pin]) => [slug, pinVersion(pin)]))
