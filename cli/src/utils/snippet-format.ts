export const SNIPPETS_ENDPOINT = 'loopress/v1/snippets'

export type SnippetType = 'css' | 'html' | 'js' | 'php' | 'text'
export type SnippetInsertMethod = 'auto' | 'shortcode'

// 'everywhere' | 'frontend' | 'admin' | 'once' only make sense for PHP snippets; 'header' |
// 'body' | 'footer' are universal site-wide placements. The WordPress plugin (WPCode or Code
// Snippets, whichever is active) translates these to its own backend-specific vocabulary.
export type SnippetLocation = 'admin' | 'body' | 'everywhere' | 'footer' | 'frontend' | 'header' | 'once'

export interface NormalizedSnippet {
  active: boolean
  code: string
  description: string
  id: number
  insertMethod: SnippetInsertMethod
  location: SnippetLocation
  name: string
  priority: number
  shortcodeAttributes: string[]
  tags: string[]
  type: SnippetType
}

export function parseType(raw: unknown): null | SnippetType {
  const valid: SnippetType[] = ['css', 'html', 'js', 'php', 'text']
  const value = String(raw ?? '').toLowerCase()
  return valid.includes(value as SnippetType) ? (value as SnippetType) : null
}

const VALID_LOCATIONS = new Set<SnippetLocation>(['admin', 'body', 'everywhere', 'footer', 'frontend', 'header', 'once'])

export function parseLocation(raw: unknown): null | SnippetLocation {
  const value = String(raw ?? '').toLowerCase()
  return VALID_LOCATIONS.has(value as SnippetLocation) ? (value as SnippetLocation) : null
}

export function parseInsertMethod(raw: unknown): null | SnippetInsertMethod {
  return raw === 'auto' || raw === 'shortcode' ? raw : null
}

// The sensible default placement for a freshly pushed snippet that doesn't specify a location.
export function defaultLocationForType(type: SnippetType): SnippetLocation {
  switch (type) {
    case 'css': {
      return 'header'
    }

    case 'html':
    case 'js':
    case 'text': {
      return 'footer'
    }

    case 'php': {
      return 'everywhere'
    }
  }
}

function resolvePriority(raw: unknown): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 10
}

// Snippet files on disk keep the <?php opening tag so they're valid, syntax-highlighted PHP files.
// The WordPress plugin stores just the executable body, so it's stripped before push and restored
// on pull (see buildSnippetFile in commands/snippet/pull.ts).
export function stripPhpOpeningTag(code: string): string {
  return code.replace(/^<\?php\s*/i, '')
}

// Defensive coercion for whatever JSON the `loopress/v1/snippets` endpoint returns, in case a
// field is missing or malformed server-side.
export function normalizeSnippet(data: Record<string, unknown>): NormalizedSnippet {
  return {
    active: Boolean(data.active),
    code: String(data.code ?? ''),
    description: String(data.description ?? ''),
    id: Number(data.id),
    insertMethod: parseInsertMethod(data.insertMethod) ?? 'auto',
    location: parseLocation(data.location) ?? defaultLocationForType(parseType(data.type) ?? 'php'),
    name: String(data.name ?? ''),
    priority: resolvePriority(data.priority),
    shortcodeAttributes: Array.isArray(data.shortcodeAttributes) ? (data.shortcodeAttributes as unknown[]).map(String) : [],
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    type: parseType(data.type) ?? 'php',
  }
}
