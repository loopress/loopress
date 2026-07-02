export type PluginName = 'code-snippets' | 'wpcode'
export type SnippetType = 'css' | 'html' | 'js' | 'php' | 'text'

export interface NormalizedSnippet {
  active: boolean
  code: string
  description: string
  id: number
  name: string
  tags: string[]
  type: SnippetType
}

export function parseType(raw: unknown): null | SnippetType {
  const valid: SnippetType[] = ['css', 'html', 'js', 'php', 'text']
  const value = String(raw ?? '').toLowerCase()
  return valid.includes(value as SnippetType) ? (value as SnippetType) : null
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

export interface SnippetPlugin {
  endpoint(siteUrl: string): string
  fromRemote(data: Record<string, unknown>): NormalizedSnippet
  toPayload(name: string, code: string, path: string, type: SnippetType): Record<string, unknown>
}

class CodeSnippetsPlugin implements SnippetPlugin {
  endpoint(siteUrl: string): string {
    return `${siteUrl}/wp-json/code-snippets/v1/snippets`
  }

  fromRemote(data: Record<string, unknown>): NormalizedSnippet {
    return {
      active: Boolean(data.active),
      code: String(data.code ?? ''),
      description: String(data.desc ?? ''),
      id: Number(data.id),
      name: String(data.name ?? ''),
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
      type: resolveType(data.type, String(data.code ?? '')),
    }
  }

  toPayload(name: string, code: string, path: string, type: SnippetType): Record<string, unknown> {
    return {
      code: code.replace(/^<\?php\s*/i, ''),
      desc: `Imported from ${path}`,
      name,
      tags: ['cli-import'],
      type,
    }
  }
}

class WPCodePlugin implements SnippetPlugin {
  endpoint(siteUrl: string): string {
    return `${siteUrl}/wp-json/loopress/v1/wpcode/snippets`
  }

  fromRemote(data: Record<string, unknown>): NormalizedSnippet {
    return {
      active: Boolean(data.active),
      code: String(data.code ?? ''),
      description: String(data.note ?? ''),
      id: Number(data.id),
      name: String(data.title ?? ''),
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
      type: resolveType(data.type, String(data.code ?? '')),
    }
  }

  toPayload(name: string, code: string, path: string, type: SnippetType): Record<string, unknown> {
    return {
      code,
      note: `Imported from ${path}`,
      tags: ['cli-import'],
      title: name,
      type,
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
