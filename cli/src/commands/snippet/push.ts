import {Args, Flags} from '@oclif/core'
import got from 'got'

import {PushCommand} from '../../lib/push-command.js'
import {Snippet} from '../../types/snippet.js'
import {recordDeployment} from '../../utils/api.js'
import {getSnippetPlugin, PluginName} from '../../utils/snippet-plugin.js'

export default class Push extends PushCommand {
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
    ...PushCommand.baseFlags,
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
    this.dryRun = dryRun
    const {url} = this.siteConfig
    const path = await this.resolveSnippetsPath(args.path)

    this.log(`🚀 Pushing snippets to ${url} via ${plugin}`)
    this.log(`📂 From snippet path: ${path}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    let snippets: Snippet[] = []
    try {
      snippets = await this.loadSnippets(path)
      this.log(`✅ Found ${snippets.length} snippets to push`)

      const headers = await this.buildAuthHeaders()
      const adapter = getSnippetPlugin(plugin)
      for (const snippet of snippets) {
        await this.pushSnippet(snippet, url, headers, dryRun, adapter)
      }

      if (!dryRun) await recordDeployment({url, snippetCount: snippets.length, status: 'success'})
      this.log('🎉 All snippets pushed successfully!')
    } catch (error) {
      if (!dryRun) await recordDeployment({url, snippetCount: snippets.length, status: 'failure'})
      this.error((error as Error).message)
    }
  }

  private async injectIdIntoFile(filePath: string, content: string, id: number): Promise<void> {
    const fs = await import('node:fs/promises')
    let updated: string

    if (content.includes('/**')) {
      updated = content.replace('/**', `/**\n * id: ${id}`)
    } else if (content.includes('<!--')) {
      updated = content.replace('<!--', `<!--\n  id: ${id}`)
    } else {
      return
    }

    await fs.writeFile(filePath, updated)
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
          const meta = this.parseMetaFromContent(content)
          snippets.push({
            code: content,
            id: meta.id,
            name: meta.name ?? file.replace('.php', ''),
            path: filePath,
          })
        }
      }
    } catch (error) {
      this.error(`❌ Error loading snippets: ${(error as Error).message}`)
    }

    return snippets
  }

  private parseMetaFromContent(content: string): {id?: number; name?: string} {
    const idMatch = content.match(/[\s*]*id:\s*(\d+)/)
    const nameMatch = content.match(/[\s*]*name:\s*(.+)/)
    return {
      id: idMatch ? Number(idMatch[1]) : undefined,
      name: nameMatch ? nameMatch[1].trim() : undefined,
    }
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
      await this.injectIdIntoFile(snippet.path, snippet.code, created.id)
      this.log(`✅ Created: ${snippet.name} (id: ${created.id})`)
    } catch (error) {
      this.error(`❌ Error pushing snippet ${snippet.name}: ${(error as Error).message}`)
    }
  }
}
