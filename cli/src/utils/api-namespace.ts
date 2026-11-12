// The REST namespace custom API routes register under: `api.namespace` in loopress.json.
// Mirrors the plugin's ApiNamespace (wordpress-plugin/src/Api/ApiNamespace.php), so a bad value
// is refused locally before anything is written to the site.
export const DEFAULT_API_NAMESPACE = 'loopress-api/v1'

// Reserved for Loopress's own management endpoints.
const RESERVED = 'loopress/v1'
const PATTERN = /^[a-z][a-z0-9-]*\/v\d+$/

// Returns why the value is refused, or undefined when it is fine.
export function apiNamespaceProblem(value: unknown): string | undefined {
  if (typeof value !== 'string') return '"api.namespace" must be a string like "loopress-api/v1"'
  if (value === RESERVED) return `"api.namespace" cannot be "${RESERVED}": it is reserved for Loopress's own endpoints`
  if (!PATTERN.test(value)) return `"api.namespace" must look like "my-api/v1": lowercase letters, digits and hyphens, a slash, then v and a number`
  return undefined
}

export function localApiNamespace(config: {api?: {namespace?: string}}): string {
  return config.api?.namespace ?? DEFAULT_API_NAMESPACE
}
