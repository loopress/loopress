import {confirm} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {basename, dirname, extname, join} from 'node:path'

import {isExcluded} from '../../lib/exclude.js'
import {numericPrefixKey} from '../../lib/find-orphaned-files.js'
import {isInteractive} from '../../lib/interactive.js'
import {loadSnippets as loadSnippetsFromDisk} from '../../lib/load-snippets.js'
import {errorCode, errorMessage, isRecord} from '../../lib/narrow.js'
import {type PushChange, PushCommand} from '../../lib/push-command.js'
import {putOrCreate} from '../../lib/put-or-create.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {type LoopressSnippetMetadata} from '../../types/snippet.generated.js'
import {type Snippet} from '../../types/snippet.js'
import {pluralize} from '../../utils/pluralize.js'
import {renameWithRetry} from '../../utils/rename-retry.js'
import {normalizeSnippet, SNIPPETS_ENDPOINT, stripPhpOpeningTag} from '../../utils/snippet-format.js'
import {toSlug} from '../../utils/to-slug.js'

type PushedSnippet = {
  id?: number | undefined
  name: string
}

type PushResult = {
  changes?: PushChange[]
  pruned?: PushedSnippet[]
  pushed: PushedSnippet[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static override args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }

  static override description =
    'Push local snippet files to WordPress. Local snippet files created or updated remotely are renamed on disk to the `<id>-<slug>` convention.'

  static override enableJsonFlag = true
  static override examples = ['$ lps snippet push', '$ lps snippet push ./snippets', '$ lps snippet push --no-prune']
  static override flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
    prune: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Delete site snippets not present locally (default), --no-prune keeps them',
    }),
  }

  // True when the environment has no earlier snapshot: a sidecar id can then come from another
  // site (same WordPress post ids), so it is checked against the site's snippet at that id.
  private idsUnverified = false

  // Local files that could not be read: their snippets are unknown, so nothing is pruned.
  private skippedFiles = 0

  async run(): Promise<PushResult> {
    const {args, flags} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveSnippetsPath(args.path)

    this.log(`Pushing snippets to ${url}`)
    this.log(`Snippets path: ${path}`)

    const provider = getResourceStateProvider('snippet')
    const beforeState = await this.captureBeforePushState(provider, path)

    const loaded = await this.loadSnippets(path)
    const snippets = this.withoutDuplicateIds(loaded)
    this.idsUnverified = await this.idsFromElsewhere('snippet')
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

    if (this.failedCount > 0) {
      await this.writeAfterPushSnapshot(provider, path, beforeState)
      this.error(`${pluralize(this.failedCount, 'snippet')} failed to push.`)
    }

    const keep = new Set<number>(loaded.flatMap((snippet) => (snippet.id === undefined ? [] : [snippet.id])))
    for (const {id} of pushed) if (id !== undefined) keep.add(id)
    const pruned = flags.prune ? await this.pruneRemote(path, keep, loaded.length) : []

    await this.writeAfterPushSnapshot(provider, path, beforeState)

    if (this.dryRun) return {changes: this.previewChanges, pruned, pushed, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All snippets pushed.')
    return {pruned, pushed, status: 'success'}
  }

  private async currentSnippet(id: number): Promise<ReturnType<typeof normalizeSnippet> | undefined> {
    try {
      return normalizeSnippet(await this.wp.get<Record<string, unknown>>(`${SNIPPETS_ENDPOINT}/${id}`))
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
    let existing: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(await readFile(oldMetaPath, 'utf8'))
      if (isRecord(parsed)) existing = parsed
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
    }

    // Spread, not rebuilt: keys the CLI doesn't know about survive, in their original order.
    const meta = {...existing, id, name, type: snippet.type} satisfies LoopressSnippetMetadata

    // Persist the id against the *current* file pairing before renaming anything, so a
    // crash between the rename and the sidecar write still leaves a valid `<name>.<ext>` /
    // `<name>.json` pair with the id on disk, and a retried `snippet push` won't re-create
    // this snippet as a duplicate because it looks unlinked.
    await writeFile(oldMetaPath, JSON.stringify(meta, null, 2) + '\n')

    if (currentBase === canonicalBase) return

    const newPath = join(dir, `${canonicalBase}${ext}`)
    const newMetaPath = join(dir, `${canonicalBase}.json`)

    await renameWithRetry(snippet.path, newPath)
    await writeFile(newMetaPath, JSON.stringify(meta, null, 2) + '\n')
    await rm(oldMetaPath, {force: true})
  }

  // Ids of local files left out of this run on purpose (`exclude` in loopress.json): their site
  // snippet must stay.
  private async excludedIds(path: string): Promise<number[]> {
    const files = await readdir(path).catch(() => [] as string[])
    return files
      .filter((file) => isExcluded(join(path, file)))
      .flatMap((file) => {
        const key = numericPrefixKey(basename(file, extname(file)))
        return key === null ? [] : [Number(key)]
      })
  }

  private async loadSnippets(path: string): Promise<Snippet[]> {
    try {
      return await loadSnippetsFromDisk(path, (message) => {
        this.skippedFiles++
        this.warn(message)
      })
    } catch (error) {
      this.error(errorMessage(error))
    }
  }

  // Mirror of `hook push` / `api push`: a snippet on the site with no local file is deleted
  // (the repo is the reference), `--no-prune` opts out. Production asks first.
  private async pruneRemote(path: string, keep: Set<number>, localCount: number): Promise<PushedSnippet[]> {
    const remote = (await this.wp.get<Array<Record<string, unknown>>>(SNIPPETS_ENDPOINT)).map((r) => normalizeSnippet(r))
    for (const id of await this.excludedIds(path)) keep.add(id)
    const orphans = remote.filter((snippet) => !keep.has(snippet.id)).map(({id, name}) => ({id, name}))

    if (this.skippedFiles > 0) {
      if (orphans.length > 0) this.warn(`Not pruning: ${pluralize(this.skippedFiles, 'local file')} could not be read, so the site's snippets cannot be compared safely.`)
      return []
    }

    if (localCount === 0 && orphans.length > 0) {
      this.error(
        `Refusing to prune: ${path} is missing or holds no snippet, so every snippet on ${this.siteConfig.url} would be deleted. ` +
          'Check the path, or pass --no-prune to push without deleting.',
      )
    }

    if (orphans.length === 0) return []

    const summary = `${pluralize(orphans.length, 'snippet')} on ${this.siteConfig.url} not present locally: ${orphans.map((o) => o.id + ' "' + o.name + '"').join(', ')}`
    if (this.dryRun) {
      this.log(`[dry-run] Would prune ${summary}`)
      return orphans
    }

    if (!this.yes && this.siteConfig.name.toLowerCase() === 'production') {
      if (!isInteractive()) {
        this.error(`Pushing would prune ${pluralize(orphans.length, 'site snippet')} but stdin is not a TTY. Re-run with --yes to confirm, or with --no-prune.`)
      }

      if (!(await confirm({default: false, message: `Prune ${summary}?`}))) {
        this.log('Kept the site snippets, nothing pruned.')
        return []
      }
    }

    const done: PushedSnippet[] = []
    for (const orphan of orphans) {
      // eslint-disable-next-line no-await-in-loop -- one DELETE at a time, a failure stops the run with the rest untouched
      await this.wp.delete(`${SNIPPETS_ENDPOINT}/${orphan.id}`)
      done.push(orphan)
    }

    this.log(`Pruned ${summary}`)
    return done
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
        const current = await this.currentSnippet(snippet.id)
        if (current !== undefined && this.idsUnverified && current.name !== snippet.name) {
          throw new Error(
            `${basename(snippet.path)} has id ${snippet.id}, but snippet ${snippet.id} on this site is "${current.name}", not "${snippet.name}": the id may come from another site. ` +
              'Pass --overwrite to replace it anyway.',
          )
        }

        if (current?.revision !== undefined) putPayload = {...payload, expectedRevision: current.revision}
      }

      // The id recorded locally may not exist on this site (e.g. a fresh install): putOrCreate
      // falls back to POST instead of failing, adopting whatever id the site assigns.
      const {body, created} = await putOrCreate(this.wp, {
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
      } else if (id !== undefined) {
        await this.ensureCanonicalFilename(snippet, id, snippet.name)
      }

      if (task) task.output = `Pushed: ${snippet.name}`
      return id
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${snippet.name}: ${errorMessage(error)}`, error, task)
    }
  }

  private toPayload(snippet: Snippet): Record<string, unknown> {
    return {
      active: snippet.active,
      // Only PHP files carry an editor-only `<?php` tag: an HTML snippet starting with an inline
      // `<?php ... ?>` block is its real content and must reach WordPress untouched.
      code: snippet.type === 'php' ? stripPhpOpeningTag(snippet.code) : snippet.code,
      // The sidecar's description wins, so a pull then push never erases one written in wp-admin.
      description: snippet.description ?? `Imported from ${snippet.path}`,
      insertMethod: snippet.insertMethod,
      location: snippet.location,
      name: snippet.name,
      priority: snippet.priority,
      shortcodeAttributes: snippet.shortcodeAttributes,
      tags: snippet.tags,
      type: snippet.type,
    }
  }

  // Two files claiming the same id would each PUT over that id, the last one silently replacing
  // the other on the site (seen after switching snippet provider, whose ids restart). Neither is
  // pushed, and the push fails, until the files are fixed by hand.
  private withoutDuplicateIds(snippets: Snippet[]): Snippet[] {
    const pathsById = new Map<number, string[]>()
    for (const {id, path} of snippets) {
      if (id !== undefined) pathsById.set(id, [...(pathsById.get(id) ?? []), path])
    }

    return snippets.filter((snippet) => {
      const paths = snippet.id === undefined ? [] : (pathsById.get(snippet.id) ?? [])
      if (paths.length < 2) return true
      this.failedCount++
      this.warn(`Skipping "${snippet.path}": id ${snippet.id} is also used by ${paths.filter((p) => p !== snippet.path).join(', ')}.`)
      return false
    })
  }
}
