import {Args, Flags} from '@oclif/core'
import got from 'got'

import {PushCommand} from '../../lib/push-command.js'
import {Snippet} from '../../types/snippet.js'
import {getSnippetPlugin, PluginName} from '../../utils/snippet-plugin.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }
  static description = 'Push snippets to WordPress'
  static examples = [
    '$ lps snippet push',
    '$ lps snippet push --url http://example.com',
    '$ lps snippet push --path ./snippets',
    '$ lps snippet push --plugin wpcode',
  ]
  static flags = {
    ...PushCommand.baseFlags,
    dryRun: Flags.boolean({char: 'd', description: 'Dry run - show what would happen without making changes'}),
    plugin: Flags.string({
      char: 'p',
      description: 'WordPress snippet plugin to target (overrides loopress.json)',
      options: ['code-snippets', 'wpcode'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const {dryRun, plugin} = flags as {dryRun: boolean; plugin: string | undefined}
    this.dryRun = dryRun
    const {url} = this.siteConfig
    const path = await this.resolveSnippetsPath(args.path)
    const resolvedPlugin = await this.resolveSnippetPlugin(plugin)

    this.log(`🚀 Pushing snippets to ${url} via ${resolvedPlugin}`)
    this.log(`📂 From snippet path: ${path}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    let snippets: Snippet[] = []
    try {
      snippets = await this.loadSnippets(path)
      this.log(`✅ Found ${snippets.length} snippets to push`)

      const headers = await this.buildAuthHeaders()
      const adapter = getSnippetPlugin(resolvedPlugin)
      for (const snippet of snippets) {
        await this.pushSnippet(snippet, {adapter, dryRun, headers, url})
      }

      await this.recordSuccess()
      this.log('🎉 All snippets pushed successfully!')
    } catch (error) {
      this.error((error as Error).message)
    }
  }

  private async injectIdIntoMeta(filePath: string, id: number): Promise<void> {
    const fs = await import('node:fs/promises')
    const metaPath = filePath.replace(/\.[^.]+$/, '.json')
    let meta: Record<string, unknown> = {}
    try {
      const existing = await fs.readFile(metaPath, 'utf8')
      meta = JSON.parse(existing) as Record<string, unknown>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    meta.id = id
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n')
  }

  private async loadSnippets(path: string): Promise<Snippet[]> {
    const fs = await import('node:fs/promises')
    const snippets: Snippet[] = []

    const SNIPPET_EXTENSIONS = new Set(['.css', '.html', '.js', '.php', '.txt'])

    try {
      const files = await fs.readdir(path)
      for (const file of files) {
        const ext = file.slice(file.lastIndexOf('.'))
        if (!SNIPPET_EXTENSIONS.has(ext)) continue

        const filePath = `${path}/${file}`
        const metaPath = filePath.slice(0, filePath.lastIndexOf('.')) + '.json'
        const content = await fs.readFile(filePath, 'utf8')

        let id: number | undefined
        let name: string | undefined
        try {
          const metaContent = await fs.readFile(metaPath, 'utf8')
          const meta = JSON.parse(metaContent) as Record<string, unknown>
          id = meta.id ? Number(meta.id) : undefined
          name = meta.name ? String(meta.name) : undefined
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }

        snippets.push({
          code: content,
          id,
          name: name ?? file.slice(0, file.lastIndexOf('.')),
          path: filePath,
        })
      }
    } catch (error) {
      this.error(`❌ Error loading snippets: ${(error as Error).message}`)
    }

    return snippets
  }

  private async pushSnippet(
    snippet: Snippet,
    ctx: {adapter: ReturnType<typeof getSnippetPlugin>; dryRun: boolean; headers: Record<string, string>; url: string},
  ) {
    const {adapter, dryRun, headers, url} = ctx

    if (dryRun) {
      this.log(`📝 [DRY RUN] Would push snippet: ${snippet.name}`)
      this.log(`📄 Code preview: ${snippet.code.slice(0, 100)}...`)
      return
    }

    try {
      const endpoint = adapter.endpoint(url)
      const payload = adapter.toPayload(snippet.name, snippet.code, snippet.path)

      if (snippet.id) {
        this.log(`🔄 Updating snippet by id (${snippet.id}): ${snippet.name}`)
        await got.put(`${endpoint}/${snippet.id}`, {headers, json: payload})
        this.log(`✅ Updated: ${snippet.name}`)
        return
      }

      this.log(`➕ Creating new snippet: ${snippet.name}`)
      const response: Record<string, unknown> = await got.post(endpoint, {headers, json: payload}).json()
      const created = adapter.fromRemote(response)
      await this.injectIdIntoMeta(snippet.path, created.id)
      this.log(`✅ Created: ${snippet.name} (id: ${created.id})`)
    } catch (error) {
      this.error(`❌ Error pushing snippet ${snippet.name}: ${(error as Error).message}`)
    }
  }
}
