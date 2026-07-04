import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {readdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {basename, dirname, extname, join} from 'node:path'
import slugify from 'slugify'

import {PushCommand} from '../../lib/push-command.js'
import {LoopressSnippetMetadata} from '../../types/snippet.generated.js'
import {Snippet} from '../../types/snippet.js'
import {
  defaultLocationForType,
  normalizeSnippet,
  parseInsertMethod,
  parseLocation,
  parseType,
  SnippetInsertMethod,
  SnippetLocation,
  SNIPPETS_ENDPOINT,
  SnippetType,
  stripPhpOpeningTag,
} from '../../utils/snippet-format.js'

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
  static examples = ['$ lps snippet push', '$ lps snippet push --path ./snippets']
  static flags = {
    ...PushCommand.dryRunFlag,
  }
  private failedCount = 0

  async run(): Promise<void> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveSnippetsPath(args.path)

    this.log(`Pushing snippets to ${url}`)
    this.log(`Snippets path: ${path}`)

    const snippets = await this.loadSnippets(path)
    this.log(`Found ${snippets.length} snippet${snippets.length === 1 ? '' : 's'} to push`)

    await new Listr(
      snippets.map((snippet) => ({
        task: async (_ctx, task) => this.pushSnippet(snippet, task),
        title: `Push ${snippet.name}`,
      })),
      {concurrent: false, exitOnError: false},
    ).run()

    if (this.failedCount > 0) {
      this.error(`${this.failedCount} snippet${this.failedCount === 1 ? '' : 's'} failed to push.`)
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
    let meta: LoopressSnippetMetadata = {}
    try {
      const existing = await readFile(oldMetaPath, 'utf8')
      meta = JSON.parse(existing) as LoopressSnippetMetadata
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    meta.id = id
    meta.name = name
    meta.type = snippet.type

    // Persist the id against the *current* file pairing before renaming anything, so a
    // crash between the rename and the sidecar write still leaves a valid `<name>.<ext>` /
    // `<name>.json` pair with the id on disk, and a retried `snippet push` won't re-create
    // this snippet as a duplicate because it looks unlinked.
    await writeFile(oldMetaPath, JSON.stringify(meta, null, 2) + '\n')

    if (currentBase === canonicalBase) return

    const newPath = join(dir, `${canonicalBase}${ext}`)
    const newMetaPath = join(dir, `${canonicalBase}.json`)

    await rename(snippet.path, newPath)
    await writeFile(newMetaPath, JSON.stringify(meta, null, 2) + '\n')
    await rm(oldMetaPath, {force: true})
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
        let active = false
        let tags: string[] = []
        let location: null | SnippetLocation = null
        let insertMethod: null | SnippetInsertMethod = null
        let priority = 10
        let shortcodeAttributes: string[] = []
        try {
          const metaContent = await readFile(metaPath, 'utf8')
          const meta = JSON.parse(metaContent) as LoopressSnippetMetadata
          id = meta.id ? Number(meta.id) : undefined
          name = meta.name ? String(meta.name) : undefined
          type = parseType(meta.type) ?? undefined
          active = Boolean(meta.active)
          tags = Array.isArray(meta.tags) ? meta.tags.map(String) : []
          location = parseLocation(meta.location)
          insertMethod = parseInsertMethod(meta.insertMethod)
          priority = meta.priority === undefined ? 10 : Number(meta.priority)
          shortcodeAttributes = Array.isArray(meta.shortcodeAttributes) ? meta.shortcodeAttributes.map(String) : []
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }

        const resolvedType = type ?? (ext in TYPE_BY_EXTENSION ? TYPE_BY_EXTENSION[ext as keyof typeof TYPE_BY_EXTENSION] : 'php')

        snippets.push({
          active,
          code: content,
          id,
          insertMethod: insertMethod ?? 'auto',
          location: location ?? defaultLocationForType(resolvedType),
          name: name ?? basename(file, ext),
          path: filePath,
          priority,
          shortcodeAttributes,
          tags,
          type: resolvedType,
        })
      }
    } catch (error) {
      this.error(`Error loading snippets: ${(error as Error).message}`)
    }

    return snippets
  }

  // Throwing on failure (rather than returning a boolean) is what lets Listr mark the task as
  // failed (red cross) instead of completed; `exitOnError: false` on the task list still lets
  // sibling snippets push regardless.
  private async pushSnippet(snippet: Snippet, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${snippet.name}`
      return
    }

    try {
      const payload = this.toPayload(snippet)

      if (snippet.id) {
        await this.wp.put(`${SNIPPETS_ENDPOINT}/${snippet.id}`, payload)
        await this.ensureCanonicalFilename(snippet, snippet.id, snippet.name)
      } else {
        const response = await this.wp.post<Record<string, unknown>>(SNIPPETS_ENDPOINT, payload)
        const created = normalizeSnippet(response)
        await this.ensureCanonicalFilename(snippet, created.id, created.name)
      }

      if (task) task.output = `Pushed: ${snippet.name}`
    } catch (error) {
      const message = `Failed to push ${snippet.name}: ${(error as Error).message}`
      if (task) task.output = message
      else this.warn(`  ${message}`)
      this.failedCount++
      throw error
    }
  }

  private toPayload(snippet: Snippet): Record<string, unknown> {
    return {
      active: snippet.active,
      code: stripPhpOpeningTag(snippet.code),
      description: `Imported from ${snippet.path}`,
      insertMethod: snippet.insertMethod,
      location: snippet.location,
      name: snippet.name,
      priority: snippet.priority,
      shortcodeAttributes: snippet.shortcodeAttributes,
      tags: snippet.tags,
      type: snippet.type,
    }
  }
}
