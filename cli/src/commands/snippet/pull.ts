import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises'
import {extname, join} from 'node:path'
import slugify from 'slugify'

import {LoopressCommand} from '../../lib/base.js'
import {LoopressSnippetMetadata} from '../../types/snippet.generated.js'
import {NormalizedSnippet, normalizeSnippet, SNIPPETS_ENDPOINT, SnippetType} from '../../utils/snippet-format.js'

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
  const meta: LoopressSnippetMetadata = {
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
  static examples = ['$ lps snippet pull', '$ lps snippet pull --path ./snippets']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveSnippetsPath(args.path)

    this.log(`Pulling snippets from ${url}`)
    this.log(`Snippets path: ${path}`)

    const remoteList = await this.wp.get<Record<string, unknown>[]>(SNIPPETS_ENDPOINT)
    const snippets = remoteList.map((r) => normalizeSnippet(r))
    const pullable = snippets.filter((snippet) => snippet.name.trim())
    const skipped = snippets.length - pullable.length

    // Files following the `<id>-<slug>` convention whose id is no longer in the current
    // remote list belong to a snippet that was deleted on WordPress. Left on disk, they'd
    // silently come back to life the next time `snippet push` runs.
    const orphans = await this.findOrphanedFiles(path, new Set(pullable.map((snippet) => snippet.id)))

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${snippets.length} snippet${snippets.length === 1 ? '' : 's'} to ${path}`)
      if (orphans.length > 0) {
        this.log(
          `[dry-run] Would remove ${orphans.length} local file${orphans.length === 1 ? '' : 's'} whose snippet no longer exists on WordPress: ${orphans.join(', ')}`,
        )
      }

      return
    }

    await mkdir(path, {recursive: true})

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

    for (const file of orphans) await rm(join(path, file), {force: true})
    if (orphans.length > 0) {
      this.warn(
        `Removed ${orphans.length} local file${orphans.length === 1 ? '' : 's'} whose snippet no longer exists on WordPress: ${orphans.join(', ')}`,
      )
    }

    this.log(`Pulled ${pullable.length} snippet${pullable.length === 1 ? '' : 's'} to ${path}`)
    if (skipped > 0) {
      this.warn(`${skipped} snippet${skipped === 1 ? '' : 's'} skipped because they have no name`)
    }
  }

  // Only ever matches files already following the `<id>-<slug>` convention that `snippet
  // pull`/`push` themselves produce, so a hand-created file without a numeric prefix is
  // never at risk of being picked up here.
  private async findOrphanedFiles(path: string, keepIds: Set<number>): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    const knownExtensions = new Set(['json', ...Object.values(EXTENSIONS)])

    return files.filter((file) => {
      const ext = extname(file).slice(1)
      if (!knownExtensions.has(ext)) return false

      const match = /^(\d+)-/.exec(file)
      return match !== null && !keepIds.has(Number(match[1]))
    })
  }
}
