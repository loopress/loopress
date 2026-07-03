import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import slugify from 'slugify'

import {LoopressCommand} from '../../lib/base.js'
import {snippetPluginFlag} from '../../utils/snippet-plugin-flag.js'
import {getSnippetPlugin, NormalizedSnippet, SnippetType} from '../../utils/snippet-plugin.js'

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
    location: snippet.location,
  }
  if (snippet.description) meta.description = snippet.description
  if (snippet.tags.length > 0) meta.tags = snippet.tags
  if (snippet.insertMethod === 'shortcode') meta.insertMethod = snippet.insertMethod
  if (snippet.priority !== 10) meta.priority = snippet.priority
  if (snippet.shortcodeAttributes.length > 0) meta.shortcodeAttributes = snippet.shortcodeAttributes
  return JSON.stringify(meta, null, 2) + '\n'
}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }
  static description = 'Pull snippets from WordPress'
  static examples = ['$ lps snippet pull', '$ lps snippet pull --path ./snippets', '$ lps snippet pull --plugin wpcode']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...snippetPluginFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveSnippetsPath(args.path)
    const resolvedPlugin = this.resolveSnippetPlugin(flags.plugin)

    this.log(`Pulling snippets from ${url} via ${resolvedPlugin}`)
    this.log(`Snippets path: ${path}`)

    const adapter = getSnippetPlugin(resolvedPlugin)
    const remoteList = await this.wp.get<Record<string, unknown>[]>(adapter.endpointPath())
    const snippets = remoteList.map((r) => adapter.fromRemote(r))

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${snippets.length} snippet${snippets.length === 1 ? '' : 's'} to ${path}`)
      return
    }

    await mkdir(path, {recursive: true})

    const pullable = snippets.filter((snippet) => snippet.name.trim())
    const skipped = snippets.length - pullable.length

    await new Listr(
      pullable.map((snippet) => ({
        async task(_ctx, task) {
          const ext = EXTENSIONS[snippet.type]
          const slug = slugify(snippet.name, {lower: true, strict: true})
          const base = `${snippet.id}-${slug}`
          await writeFile(join(path, `${base}.${ext}`), buildSnippetFile(snippet))
          await writeFile(join(path, `${base}.json`), buildMetaFile(snippet))
          task.output = `Pulled: ${snippet.name}`
        },
        title: `Pull ${snippet.name}`,
      })),
    ).run()

    this.log(`Pulled ${pullable.length} snippet${pullable.length === 1 ? '' : 's'} to ${path}`)
    if (skipped > 0) {
      this.warn(`${skipped} snippet${skipped === 1 ? '' : 's'} skipped because they have no name`)
    }
  }
}
