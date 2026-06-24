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

const sanitize = (value: string) => value.replaceAll(/\s*\n\s*/g, ' ').trim()

function buildMetaLines(snippet: NormalizedSnippet): string[] {
  return [
    `id: ${snippet.id}`,
    `name: ${sanitize(snippet.name)}`,
    ...(snippet.description ? [`description: ${sanitize(snippet.description)}`] : []),
    `type: ${snippet.type}`,
    ...(snippet.tags.length > 0 ? [`tags: ${snippet.tags.map((t) => sanitize(t)).join(', ')}`] : []),
    `active: ${snippet.active}`,
  ]
}

function buildSnippetFile(snippet: NormalizedSnippet): string {
  const meta = buildMetaLines(snippet)

  switch (snippet.type) {
    case 'css':
    case 'js': {
      const header = ['/**', ...meta.map((l) => ` * ${l}`), ' */'].join('\n')
      return `${header}\n\n${snippet.code}`
    }

    case 'html': {
      const header = ['<!--', ...meta.map((l) => `  ${l}`), '-->'].join('\n')
      return `${header}\n\n${snippet.code}`
    }

    case 'text': {
      return snippet.code
    }

    case 'php':
    default: {
      const header = ['<?php', '/**', ...meta.map((l) => ` * ${l}`), ' */'].join('\n')
      const body = snippet.code.replace(/^<\?php\s*/i, '')
      return `${header}\n\n${body}`
    }
  }
}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }
  static description = 'Pull snippets from WordPress'
  static examples = [
    '$ lps snippets pull',
    '$ lps snippets pull --url http://example.com',
    '$ lps snippets pull --path ./snippets',
    '$ lps snippets pull --plugin wpcode',
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
    const {args, flags} = await this.parse(Pull)
    const {dryRun, plugin} = flags as {dryRun: boolean; plugin: PluginName}
    const {url} = this.siteConfig
    const path = await this.resolveSnippetsPath(args.path)

    this.log(`📥 Pulling snippets from ${url} via ${plugin}`)
    this.log(`📂 From snippet path: ${path}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    try {
      const adapter = getSnippetPlugin(plugin)
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
        const filePath = `${path}/${slugify(snippet.name, {lower: true, strict: true})}.${ext}`
        await fs.writeFile(filePath, buildSnippetFile(snippet))
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
