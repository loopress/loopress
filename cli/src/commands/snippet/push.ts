import {Args} from '@oclif/core'
import {readFile, rename, rm, writeFile} from 'node:fs/promises'
import {basename, dirname, extname, join} from 'node:path'

import {loadSnippets as loadSnippetsFromDisk} from '../../lib/load-snippets.js'
import {PushCommand} from '../../lib/push-command.js'
import {putOrCreate} from '../../lib/put-or-create.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {type LoopressSnippetMetadata} from '../../types/snippet.generated.js'
import {type Snippet} from '../../types/snippet.js'
import {pluralize} from '../../utils/pluralize.js'
import {normalizeSnippet, SNIPPETS_ENDPOINT, stripPhpOpeningTag} from '../../utils/snippet-format.js'
import {toSlug} from '../../utils/to-slug.js'

type PushedSnippet = {
  id?: number
  name: string
}

type PushResult = {
  pushed: PushedSnippet[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }

  static description =
    'Push snippets to WordPress. Local snippet files created or updated remotely are renamed on disk to the `<id>-<slug>` convention.'

  static enableJsonFlag = true
  static examples = ['$ lps snippet push', '$ lps snippet push --path ./snippets']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveSnippetsPath(args.path)

    this.log(`Pushing snippets to ${url}`)
    this.log(`Snippets path: ${path}`)

    const provider = getResourceStateProvider('snippet')
    const beforeState = await this.captureBeforePushState(provider, path)

    const snippets = await this.loadSnippets(path)
    this.log(`Found ${pluralize(snippets.length, 'snippet')} to push`)

    const pushed: PushedSnippet[] = []

    await this.runPushTasks(
      snippets,
      (snippet) => snippet.name,
      async (snippet, task) => {
        const id = await this.pushSnippet(snippet, task)
        pushed.push({id, name: snippet.name})
      },
    )

    await this.writeAfterPushSnapshot(provider, path, beforeState)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'snippet')} failed to push.`)
    }

    if (this.dryRun) return {pushed, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All snippets pushed.')
    return {pushed, status: 'success'}
  }

  private async currentRevision(id: number): Promise<string | undefined> {
    try {
      const current = await this.wp.get<Record<string, unknown>>(`${SNIPPETS_ENDPOINT}/${id}`)
      return normalizeSnippet(current).revision
    } catch (error) {
      if (isNotFoundError(error)) return undefined
      throw error
    }
  }

  // Renames the local file pair to the `<id>-<slug>` convention used by `snippet pull` whenever
  // it doesn't already match (e.g. a hand-created `demo.php` with no id, or a stale slug after a rename).
  // This is a side effect of `push`: local files on disk are renamed, not just the remote snippet.
  private async ensureCanonicalFilename(snippet: Snippet, id: number, name: string): Promise<void> {
    const dir = dirname(snippet.path)
    const ext = extname(snippet.path)
    const currentBase = basename(snippet.path, ext)
    const canonicalBase = `${id}-${toSlug(name)}`

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
    try {
      return await loadSnippetsFromDisk(path, (message) => { this.warn(message) })
    } catch (error) {
      this.error((error as Error).message)
    }
  }

  private async pushSnippet(snippet: Snippet, task?: {output: string}): Promise<number | undefined> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${snippet.name}`
      return snippet.id
    }

    try {
      const payload = this.toPayload(snippet)

      // Read the snippet's current revision right before writing it, and send it back as
      // `expectedRevision`: WordPress refuses the write (412) if something else changed the
      // snippet in between, instead of this push silently overwriting it (#234). No revision to
      // condition on when there's no known remote id yet (a first push): putPayload then equals
      // payload, and putOrCreate falls back to POST below exactly as before this existed. Kept
      // out of the POST body specifically (see postPayload): a spurious expectedRevision on a
      // create would be meaningless there.
      let putPayload: Record<string, unknown> = payload
      if (snippet.id !== undefined) {
        const expectedRevision = await this.currentRevision(snippet.id)
        if (expectedRevision !== undefined) putPayload = {...payload, expectedRevision}
      }

      // The id recorded locally may not exist on this site (e.g. a fresh install): putOrCreate
      // falls back to POST instead of failing, adopting whatever id the site assigns.
      const {body, created} = await putOrCreate<Record<string, unknown>>(this.wp, {
        id: snippet.id ?? null,
        payload: putPayload,
        postEndpoint: SNIPPETS_ENDPOINT,
        postPayload: payload,
        putEndpoint: (id) => `${SNIPPETS_ENDPOINT}/${id}`,
      })

      let {id} = snippet
      if (created) {
        const createdSnippet = normalizeSnippet(body)
        id = createdSnippet.id
        await this.ensureCanonicalFilename(snippet, createdSnippet.id, createdSnippet.name)
      } else {
        await this.ensureCanonicalFilename(snippet, snippet.id!, snippet.name)
      }

      if (task) task.output = `Pushed: ${snippet.name}`
      return id
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${snippet.name}: ${(error as Error).message}`, error, task)
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
