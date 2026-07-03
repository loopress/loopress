export type PluginName = 'code-snippets' | 'wpcode'
export type SnippetType = 'css' | 'html' | 'js' | 'php' | 'text'
export type SnippetInsertMethod = 'auto' | 'shortcode'

// Shared "where does this code run" vocabulary, reused across both plugin adapters even though
// their underlying vocab differs (WPCode's `wpcode_location` taxonomy vs Code Snippets' `scope`).
// 'everywhere' | 'frontend' | 'admin' | 'once' only make sense for PHP snippets on both plugins.
// 'header' | 'body' | 'footer' are WPCode's site-wide placements; Code Snippets only has an
// equivalent for 'header'/'footer' on js/html snippets (see CODE_SNIPPETS_SCOPE constants below).
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

function inferTypeFromCode(code: string): SnippetType {
  const firstLine = code.trimStart().split('\n')[0].trimStart()
  if (firstLine.startsWith('<?')) return 'php'
  if (firstLine.startsWith('<')) return 'html'
  return 'php'
}

function resolveType(raw: unknown, code: string): SnippetType {
  return parseType(raw) ?? inferTypeFromCode(code)
}

function resolvePriority(raw: unknown): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 10
}

// Snippet files on disk keep the <?php opening tag so they're valid, syntax-highlighted PHP files.
// Both plugins store just the executable body, so it's stripped before push and restored on pull
// (see buildSnippetFile in commands/snippet/pull.ts).
function stripPhpOpeningTag(code: string): string {
  return code.replace(/^<\?php\s*/i, '')
}

export interface SnippetPayloadInput {
  active: boolean
  code: string
  insertMethod: SnippetInsertMethod
  location: SnippetLocation
  name: string
  path: string
  priority: number
  shortcodeAttributes: string[]
  tags: string[]
  type: SnippetType
}

export interface SnippetPlugin {
  endpointPath(): string
  fromRemote(data: Record<string, unknown>): NormalizedSnippet
  toPayload(snippet: SnippetPayloadInput): Record<string, unknown>
}

// The real Code Snippets plugin has no independent "type" field: its REST API only has `scope`,
// and the snippet type is derived from it (see WPCode_Snippet::get_type_from_scope() upstream).
// Sending a `type` key (as this adapter used to) is silently ignored by that plugin.
const CODE_SNIPPETS_SCOPE_TO_LOCATION: Record<string, SnippetLocation> = {
  admin: 'admin',
  'admin-css': 'admin',
  content: 'everywhere',
  'footer-content': 'footer',
  'front-end': 'frontend',
  global: 'everywhere',
  'head-content': 'header',
  'single-use': 'once',
  'site-css': 'frontend',
  'site-footer-js': 'footer',
  'site-head-js': 'header',
}

function typeFromScope(scope: string): SnippetType {
  if (scope.endsWith('-css')) return 'css'
  if (scope.endsWith('-js')) return 'js'
  if (scope.endsWith('content')) return 'html'
  return 'php'
}

function scopeFromTypeAndLocation(type: SnippetType, location: SnippetLocation): string {
  switch (type) {
    case 'css': {
      if (location === 'frontend') return 'site-css'
      if (location === 'admin') return 'admin-css'
      throw new Error(`Code Snippets does not support the "${location}" location for CSS snippets. Use one of: frontend, admin.`)
    }

    case 'html': {
      if (location === 'header') return 'head-content'
      if (location === 'footer') return 'footer-content'
      if (location === 'everywhere') return 'content'
      throw new Error(`Code Snippets does not support the "${location}" location for HTML snippets. Use one of: header, footer, everywhere.`)
    }

    case 'js': {
      if (location === 'header') return 'site-head-js'
      if (location === 'footer') return 'site-footer-js'
      throw new Error(`Code Snippets does not support the "${location}" location for JS snippets. Use one of: header, footer.`)
    }

    case 'php': {
      if (location === 'everywhere') return 'global'
      if (location === 'frontend') return 'front-end'
      if (location === 'admin') return 'admin'
      if (location === 'once') return 'single-use'
      throw new Error(`Code Snippets does not support the "${location}" location for PHP snippets. Use one of: everywhere, frontend, admin, once.`)
    }

    case 'text': {
      throw new Error('Code Snippets has no "text" snippet type. Change the sidecar "type", or push this snippet to "wpcode" instead.')
    }
  }
}

class CodeSnippetsPlugin implements SnippetPlugin {
  endpointPath(): string {
    return 'code-snippets/v1/snippets'
  }

  fromRemote(data: Record<string, unknown>): NormalizedSnippet {
    const scope = String(data.scope ?? 'global')
    const type = typeFromScope(scope)

    return {
      active: Boolean(data.active),
      code: String(data.code ?? ''),
      description: String(data.desc ?? ''),
      id: Number(data.id),
      insertMethod: 'auto',
      location: CODE_SNIPPETS_SCOPE_TO_LOCATION[scope] ?? defaultLocationForType(type),
      name: String(data.name ?? ''),
      priority: resolvePriority(data.priority),
      shortcodeAttributes: [],
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
      type,
    }
  }

  toPayload({active, code, location, name, path, priority, tags, type}: SnippetPayloadInput): Record<string, unknown> {
    return {
      active,
      code: stripPhpOpeningTag(code),
      desc: `Imported from ${path}`,
      name,
      priority,
      scope: scopeFromTypeAndLocation(type, location),
      tags,
    }
  }
}

// WPCode taxonomy term slugs (see wpcode_register_taxonomies() and the auto-insert location
// classes upstream). 'everywhere' | 'frontend_only' | 'admin_only' | 'on_demand' only apply to
// PHP snippets; 'site_wide_header' | 'site_wide_body' | 'site_wide_footer' apply to any type.
const WPCODE_PHP_ONLY_LOCATIONS: Partial<Record<SnippetLocation, string>> = {
  admin: 'admin_only',
  everywhere: 'everywhere',
  frontend: 'frontend_only',
  once: 'on_demand',
}

const WPCODE_UNIVERSAL_LOCATIONS: Partial<Record<SnippetLocation, string>> = {
  body: 'site_wide_body',
  footer: 'site_wide_footer',
  header: 'site_wide_header',
}

const WPCODE_LOCATION_TO_CANONICAL: Record<string, SnippetLocation> = {
  'admin_only': 'admin',
  everywhere: 'everywhere',
  'frontend_only': 'frontend',
  'on_demand': 'once',
  'site_wide_body': 'body',
  'site_wide_footer': 'footer',
  'site_wide_header': 'header',
}

function wpcodeLocationTerm(type: SnippetType, location: SnippetLocation): string {
  const universal = WPCODE_UNIVERSAL_LOCATIONS[location]
  if (universal) return universal

  if (type === 'php') {
    const phpOnly = WPCODE_PHP_ONLY_LOCATIONS[location]
    if (phpOnly) return phpOnly
  }

  const allowed = type === 'php' ? 'header, body, footer, everywhere, frontend, admin, once' : 'header, body, footer'
  throw new Error(`WPCode does not support the "${location}" location for ${type} snippets. Use one of: ${allowed}.`)
}

class WPCodePlugin implements SnippetPlugin {
  endpointPath(): string {
    return 'loopress/v1/wpcode/snippets'
  }

  fromRemote(data: Record<string, unknown>): NormalizedSnippet {
    const type = resolveType(data.type, String(data.code ?? ''))

    return {
      active: Boolean(data.active),
      code: String(data.code ?? ''),
      description: String(data.note ?? ''),
      id: Number(data.id),
      insertMethod: data.insert_method === 'shortcode' ? 'shortcode' : 'auto',
      location: WPCODE_LOCATION_TO_CANONICAL[String(data.location)] ?? defaultLocationForType(type),
      name: String(data.title ?? ''),
      priority: resolvePriority(data.priority),
      shortcodeAttributes: Array.isArray(data.shortcode_attributes) ? (data.shortcode_attributes as unknown[]).map(String) : [],
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
      type,
    }
  }

  toPayload({
    active,
    code,
    insertMethod,
    location,
    name,
    path,
    priority,
    shortcodeAttributes,
    tags,
    type,
  }: SnippetPayloadInput): Record<string, unknown> {
    const placement =
      insertMethod === 'shortcode'
        ? {'shortcode_attributes': shortcodeAttributes}
        : {location: wpcodeLocationTerm(type, location)}

    return {
      active,
      code: stripPhpOpeningTag(code),
      note: `Imported from ${path}`,
      priority,
      tags,
      title: name,
      type,
      ...placement,
      'insert_method': insertMethod,
    }
  }
}

export function getSnippetPlugin(name: PluginName): SnippetPlugin {
  switch (name) {
    case 'wpcode': {
      return new WPCodePlugin()
    }

    case 'code-snippets':
    default: {
      return new CodeSnippetsPlugin()
    }
  }
}
