import {Args} from '@oclif/core'
import {readdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {basename, dirname, extname, join} from 'node:path'
import slugify from 'slugify'

import {PushCommand} from '../../lib/push-command.js'
import {Snippet} from '../../types/snippet.js'
import {snippetPluginFlag} from '../../utils/snippet-plugin-flag.js'
import {getSnippetPlugin, parseType, SnippetPlugin, SnippetType} from '../../utils/snippet-plugin.js'

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
  static description =
    'Push snippets to WordPress. Local snippet files created or updated remotely are renamed on disk to the `<id>-<slug>` convention.'
  static examples = [
    '$ lps snippet push',
    '$ lps snippet push --url http://example.com',
    '$ lps snippet push --path ./snippets',
    '$ lps snippet push --plugin wpcode',
  ]
  static flags = {
    ...PushCommand.baseFlags,
    ...PushCommand.dryRunFlag,
    ...snippetPluginFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveSnippetsPath(args.path)
    const resolvedPlugin = this.resolveSnippetPlugin(flags.plugin)

    this.log(`Pushing snippets to ${url} via ${resolvedPlugin}`)
    this.log(`Snippets path: ${path}`)

    const snippets = await this.loadSnippets(path)
    this.log(`Found ${snippets.length} snippet${snippets.length === 1 ? '' : 's'} to push`)

    const adapter = getSnippetPlugin(resolvedPlugin)
    let failed = 0
    for (const snippet of snippets) {
      const pushed = await this.pushSnippet(snippet, adapter)
      if (!pushed) failed++
    }

    if (failed > 0) {
      this.error(`${failed} snippet${failed === 1 ? '' : 's'} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All snippets pushed.')
  }

  // Renames the local file pair to the `<id>-<slug>` convention used by `snippet pull` whenever
  // it doesn't already match (e.g. a hand-created `demo.php` with no id, or a stale slug after a rename).
  // This is a side effect of `push`: local files on disk are renamed, not just the remote snippet.
  private async ensureCanonicalFilename(snippet: Snippet, id: number, name: string): Promise<void> {
    const dir = dirname(snippet.path)
    const ext = extname(snippet.path)
    const currentBase = basename(snippet.path, ext)
    const canonicalBase = `${id}-${slugify(name, {lower: true, strict: true})}`

    const oldMetaPath = join(dir, `${currentBase}.json`)
    let meta: Record<string, unknown> = {}
    try {
      const existing = await readFile(oldMetaPath, 'utf8')
      meta = JSON.parse(existing) as Record<string, unknown>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    meta.id = id
    meta.name = name

    if (currentBase === canonicalBase) {
      await writeFile(oldMetaPath, JSON.stringify(meta, null, 2) + '\n')
      return
    }

    const newPath = join(dir, `${canonicalBase}${ext}`)
    const newMetaPath = join(dir, `${canonicalBase}.json`)

    await rename(snippet.path, newPath)
    await writeFile(newMetaPath, JSON.stringify(meta, null, 2) + '\n')
    if (oldMetaPath !== newMetaPath) await rm(oldMetaPath, {force: true})

    this.log(`  Renamed: ${snippet.path} → ${newPath}`)
  }

  private async loadSnippets(path: string): Promise<Snippet[]> {
    const snippets: Snippet[] = []

    try {
      const files = await readdir(path)
      for (const file of files) {
        const ext = extname(file)
        if (!(ext in TYPE_BY_EXTENSION)) continue

        const filePath = join(path, file)
        const metaPath = join(path, `${basename(file, ext)}.json`)
        const content = await readFile(filePath, 'utf8')

        let id: number | undefined
        let name: string | undefined
        let type: SnippetType | undefined
        try {
          const metaContent = await readFile(metaPath, 'utf8')
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
          name: name ?? basename(file, ext),
          path: filePath,
          type: type ?? TYPE_BY_EXTENSION[ext],
        })
      }
    } catch (error) {
      this.error(`Error loading snippets: ${(error as Error).message}`)
    }

    return snippets
  }

  private async pushSnippet(snippet: Snippet, adapter: SnippetPlugin): Promise<boolean> {
    if (this.dryRun) {
      this.log(`[dry-run] Would push: ${snippet.name}`)
      return true
    }

    const endpointPath = adapter.endpointPath()
    const payload = adapter.toPayload(snippet.name, snippet.code, snippet.path, snippet.type)

    try {
      if (snippet.id) {
        await this.wp.put(`${endpointPath}/${snippet.id}`, payload)
        this.log(`  Updated: ${snippet.name} (id: ${snippet.id})`)
        await this.ensureCanonicalFilename(snippet, snippet.id, snippet.name)
      } else {
        const response = await this.wp.post<Record<string, unknown>>(endpointPath, payload)
        const created = adapter.fromRemote(response)
        this.log(`  Created: ${snippet.name} (id: ${created.id})`)
        await this.ensureCanonicalFilename(snippet, created.id, created.name)
      }

      return true
    } catch (error) {
      this.warn(`  Failed to push ${snippet.name}: ${(error as Error).message}`)
      return false
    }
  }
}
