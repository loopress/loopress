export type PluginName = 'code-snippets' | 'wpcode'

export interface NormalizedSnippet {
  active: boolean
  code: string
  description: string
  id: number
  name: string
  tags: string[]
}

export interface SnippetPlugin {
  endpoint(siteUrl: string): string
  fromRemote(data: Record<string, unknown>): NormalizedSnippet
  toPayload(name: string, code: string, path: string): Record<string, unknown>
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
    }
  }

  toPayload(name: string, code: string, path: string): Record<string, unknown> {
    return {
      code,
      desc: `Imported from ${path}`,
      name,
      tags: ['cli-import'],
    }
  }
}

class WPCodePlugin implements SnippetPlugin {
  endpoint(siteUrl: string): string {
    return `${siteUrl}/wp-json/wdx/v1/wpcode/snippets`
  }

  fromRemote(data: Record<string, unknown>): NormalizedSnippet {
    return {
      active: Boolean(data.active),
      code: String(data.code ?? ''),
      description: String(data.note ?? ''),
      id: Number(data.id),
      name: String(data.title ?? ''),
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    }
  }

  toPayload(name: string, code: string, path: string): Record<string, unknown> {
    return {
      code,
      note: `Imported from ${path}`,
      tags: ['cli-import'],
      title: name,
      type: 'php',
    }
  }
}

export function getSnippetPlugin(name: PluginName): SnippetPlugin {
  switch (name) {
    case 'wpcode':
      return new WPCodePlugin()
    case 'code-snippets':
    default:
      return new CodeSnippetsPlugin()
  }
}
