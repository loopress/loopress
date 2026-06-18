import {Args, Flags} from '@oclif/core'
import got from 'got'

import {Snippet} from '../../types/snippet.js'
import {NormalizedSnippet, PluginName, getSnippetPlugin} from '../../utils/snippet-plugin.js'
import {LoopressCommand} from '../base.js'

export default class Push extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }
  static description = 'Push snippets to WordPress'
  static examples = [
    '$ lps snippets push',
    '$ lps snippets push --url http://example.com',
    '$ lps snippets push --path ./snippets',
    '$ lps snippets push --plugin wpcode',
  ]
  static flags = {
    ...LoopressCommand.baseFlags,
    dryRun: Flags.boolean({char: 'd', description: 'Dry run - show what would happen without making changes'}),
    plugin: Flags.string({
      char: 'p',
      default: 'code-snippets',
      description: 'WordPress snippet plugin to target',
      options: ['code-snippets', 'wpcode'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const {dryRun, plugin} = flags as {dryRun: boolean; plugin: PluginName}
    const {url} = this.siteConfig
    const path = await this.resolveSnippetsPath(args.path)

    this.log(`🚀 Pushing snippets to ${url} via ${plugin}`)
    this.log(`📂 From snippet path: ${path}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    try {
      const snippets = await this.loadSnippets(path)
      this.log(`✅ Found ${snippets.length} snippets to push`)

      const headers = await this.buildAuthHeaders()
      const adapter = getSnippetPlugin(plugin)
      for (const snippet of snippets) {
        await this.pushSnippet(snippet, url, headers, dryRun, adapter)
      }

      this.log('🎉 All snippets pushed successfully!')
    } catch (error) {
      this.error((error as Error).message)
    }
  }

  private async loadSnippets(path: string): Promise<Snippet[]> {
    const fs = await import('node:fs/promises')
    const snippets: Snippet[] = []

    try {
      const files = await fs.readdir(path)
      for (const file of files) {
        if (file.endsWith('.php')) {
          const filePath = `${path}/${file}`
          const content = await fs.readFile(filePath, 'utf8')
          snippets.push({
            code: content,
            name: file.replace('.php', ''),
            path: filePath,
          })
        }
      }
    } catch (error) {
      this.error(`❌ Error loading snippets: ${(error as Error).message}`)
    }

    return snippets
  }

  private async pushSnippet(
    snippet: Snippet,
    url: string,
    headers: Record<string, string>,
    dryRun: boolean,
    adapter: ReturnType<typeof getSnippetPlugin>,
  ) {
    if (dryRun) {
      this.log(`📝 [DRY RUN] Would push snippet: ${snippet.name}`)
      this.log(`📄 Code preview: ${snippet.code.slice(0, 100)}...`)
      return
    }

    try {
      const endpoint = adapter.endpoint(url)
      const remoteList: Record<string, unknown>[] = await got.get(endpoint, {headers}).json()
      const existing = remoteList.map((r) => adapter.fromRemote(r)).find((s: NormalizedSnippet) => s.name === snippet.name)

      const payload = adapter.toPayload(snippet.name, snippet.code, snippet.path)

      if (existing) {
        this.log(`🔄 Updating existing snippet: ${snippet.name}`)
        await got.put(`${endpoint}/${existing.id}`, {headers, json: payload})
      } else {
        this.log(`➕ Creating new snippet: ${snippet.name}`)
        await got.post(endpoint, {headers, json: payload})
      }

      this.log(`✅ ${existing ? 'Updated' : 'Created'}: ${snippet.name}`)
    } catch (error) {
      this.error(`❌ Error pushing snippet ${snippet.name}: ${(error as Error).message}`)
    }
  }
}
