import {Args, Flags} from '@oclif/core'
import got from 'got'
import slugify from 'slugify'

import {PushCommand} from '../../lib/push-command.js'
import {Snippet} from '../../types/snippet.js'
import {getSnippetPlugin, parseType, PluginName, SnippetType} from '../../utils/snippet-plugin.js'

const TYPE_BY_EXTENSION: Record<string, SnippetType> = {
  '.css': 'css',
  '.html': 'html',
  '.js': 'js',
  '.php': 'php',
  '.txt': 'text',
}

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
    'dry-run': Flags.boolean({char: 'd', description: 'Show what would change without making changes'}),
    plugin: Flags.string({
      char: 'p',
      description: 'WordPress snippet plugin to target (overrides loopress.json)',
      options: ['code-snippets', 'wpcode'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const dryRun = flags['dry-run']
    const {plugin} = flags
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

  // Renames the local file pair to the `<id>-<slug>` convention used by `snippet pull` whenever
  // it doesn't already match (e.g. a hand-created `demo.php` with no id, or a stale slug after a rename).
  private async ensureCanonicalFilename(snippet: Snippet, id: number, name: string): Promise<void> {
    const fs = await import('node:fs/promises')

    const lastSlash = snippet.path.lastIndexOf('/')
    const dir = snippet.path.slice(0, lastSlash)
    const ext = snippet.path.slice(snippet.path.lastIndexOf('.'))
    const currentBase = snippet.path.slice(lastSlash + 1, snippet.path.lastIndexOf('.'))
    const canonicalBase = `${id}-${slugify(name, {lower: true, strict: true})}`

    const oldMetaPath = snippet.path.slice(0, snippet.path.lastIndexOf('.')) + '.json'
    let meta: Record<string, unknown> = {}
    try {
      const existing = await fs.readFile(oldMetaPath, 'utf8')
      meta = JSON.parse(existing) as Record<string, unknown>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    meta.id = id
    meta.name = name

    if (currentBase === canonicalBase) {
      await fs.writeFile(oldMetaPath, JSON.stringify(meta, null, 2) + '\n')
      return
    }

    const newPath = `${dir}/${canonicalBase}${ext}`
    const newMetaPath = `${dir}/${canonicalBase}.json`

    await fs.rename(snippet.path, newPath)
    await fs.writeFile(newMetaPath, JSON.stringify(meta, null, 2) + '\n')
    if (oldMetaPath !== newMetaPath) await fs.rm(oldMetaPath, {force: true})

    this.log(`📁 Renamed: ${snippet.path} → ${newPath}`)
  }

  private async loadSnippets(path: string): Promise<Snippet[]> {
    const fs = await import('node:fs/promises')
    const snippets: Snippet[] = []

    const SNIPPET_EXTENSIONS = new Set(Object.keys(TYPE_BY_EXTENSION))

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
        let type: SnippetType | undefined
        try {
          const metaContent = await fs.readFile(metaPath, 'utf8')
          const meta = JSON.parse(metaContent) as Record<string, unknown>
          id = meta.id ? Number(meta.id) : undefined
          name = meta.name ? String(meta.name) : undefined
          type = parseType(meta.type) ?? undefined
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }

        snippets.push({
          code: content,
          id,
          name: name ?? file.slice(0, file.lastIndexOf('.')),
          path: filePath,
          type: type ?? TYPE_BY_EXTENSION[ext] ?? 'php',
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
      const payload = adapter.toPayload(snippet.name, snippet.code, snippet.path, snippet.type)

      if (snippet.id) {
        this.log(`🔄 Updating snippet by id (${snippet.id}): ${snippet.name}`)
        await got.put(`${endpoint}/${snippet.id}`, {headers, json: payload})
        this.log(`✅ Updated: ${snippet.name}`)
        await this.ensureCanonicalFilename(snippet, snippet.id, snippet.name)
        return
      }

      this.log(`➕ Creating new snippet: ${snippet.name}`)
      const response: Record<string, unknown> = await got.post(endpoint, {headers, json: payload}).json()
      const created = adapter.fromRemote(response)
      this.log(`✅ Created: ${snippet.name} (id: ${created.id})`)
      await this.ensureCanonicalFilename(snippet, created.id, created.name)
    } catch (error) {
      this.error(`❌ Error pushing snippet ${snippet.name}: ${(error as Error).message}`)
    }
  }
}
