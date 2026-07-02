import {Args, Flags} from '@oclif/core'
import got from 'got'
import slugify from 'slugify'

import {LoopressCommand} from '../../lib/base.js'
import {getSnippetPlugin, NormalizedSnippet, PluginName, SnippetType} from '../../utils/snippet-plugin.js'

const EXTENSIONS: Record<SnippetType, string> = {
  css: 'css',
  html: 'html',
  js: 'js',
  php: 'php',
  text: 'txt',
}


export function buildSnippetFile(snippet: NormalizedSnippet): string {
  if (snippet.type === 'php' && !snippet.code.trimStart().startsWith('<?')) {
    return `<?php\n\n${snippet.code}`
  }

  return snippet.code
}

export function buildMetaFile(snippet: NormalizedSnippet): string {
  const meta: Record<string, unknown> = {
    id: snippet.id,
    name: snippet.name,
    type: snippet.type,
    active: snippet.active,
  }
  if (snippet.description) meta.description = snippet.description
  if (snippet.tags.length > 0) meta.tags = snippet.tags
  return JSON.stringify(meta, null, 2) + '\n'
}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }
  static description = 'Pull snippets from WordPress'
  static examples = [
    '$ lps snippet pull',
    '$ lps snippet pull --url http://example.com',
    '$ lps snippet pull --path ./snippets',
    '$ lps snippet pull --plugin wpcode',
  ]
  static flags = {
    ...LoopressCommand.baseFlags,
    dryRun: Flags.boolean({char: 'd', description: 'Dry run - show what would happen without making changes'}),
    plugin: Flags.string({
      char: 'p',
      description: 'WordPress snippet plugin to target (overrides loopress.json)',
      options: ['code-snippets', 'wpcode'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)
    const {dryRun, plugin} = flags as {dryRun: boolean; plugin: string | undefined}
    const {url} = this.siteConfig
    const path = await this.resolveSnippetsPath(args.path)
    const resolvedPlugin = await this.resolveSnippetPlugin(plugin)

    this.log(`📥 Pulling snippets from ${url} via ${resolvedPlugin}`)
    this.log(`📂 From snippet path: ${path}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    try {
      const adapter = getSnippetPlugin(resolvedPlugin)
      const endpoint = adapter.endpoint(url)
      const headers = await this.buildAuthHeaders()

      const remoteList: Record<string, unknown>[] = await got.get(endpoint, {headers}).json()
      const snippets = remoteList.map((r) => adapter.fromRemote(r))

      const fs = await import('node:fs/promises')
      await fs.mkdir(path, {recursive: true})

      if (dryRun) {
        this.log(`📝 [DRY RUN] Would pull ${snippets.length} snippets`)
        this.log(`🔍 Raw API sample:\n${JSON.stringify(remoteList[0], null, 2)}`)
        return
      }

      let count = 0
      let skipped = 0
      for (const snippet of snippets) {
        if (!snippet.name.trim()) {
          skipped++
          continue
        }

        const ext = EXTENSIONS[snippet.type]
        const slug = slugify(snippet.name, {lower: true, strict: true})
        const base = `${snippet.id}-${slug}`
        const filePath = `${path}/${base}.${ext}`
        const metaPath = `${path}/${base}.json`
        await fs.writeFile(filePath, buildSnippetFile(snippet))
        await fs.writeFile(metaPath, buildMetaFile(snippet))
        count++
        this.log(`✅ Pulled: ${snippet.name}`)
      }

      this.log(`🎉 Successfully pulled ${count} snippet${count === 1 ? '' : 's'} to ${path}`)
      if (skipped > 0) {
        this.warn(`${skipped} snippet${skipped === 1 ? '' : 's'} skipped because they have no name`)
      }
    } catch (error) {
      this.error(`❌ Error pulling snippets: ${(error as Error).message}`)
    }
  }
}
