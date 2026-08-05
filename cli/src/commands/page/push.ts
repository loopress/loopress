import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {readdir, readFile, rename, writeFile} from 'node:fs/promises'
import {basename, dirname, extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {getPageId, getPageTitle, PAGE_ENDPOINT, pageFileBase} from '../../utils/page-format.js'

interface LocalPage {
  content: string
  contentPath: string
  meta: Record<string, unknown>
  metaPath: string
}

interface PushedPage {
  id: null | number
  title: string
}

interface PushResult {
  pushed: PushedPage[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to pages directory (overrides project config)'}),
  }
  static description =
    'Push pages to WordPress. Local files created or updated remotely are renamed on disk to the `<id>-<slug>` convention.'
  static enableJsonFlag = true
  static examples = ['$ lps page push']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolvePagePath(args.path)

    this.log(`Pushing pages to ${url}`)
    this.log(`Pages path: ${path}`)

    const pages = await this.loadFiles(path)
    this.log(`Found ${pages.length} page${pages.length === 1 ? '' : 's'} to push`)

    const pushed: PushedPage[] = []

    await new Listr(
      pages.map((page) => ({
        task: async (_ctx, task) => {
          const id = await this.pushPage(page, task)
          pushed.push({id, title: getPageTitle(page.meta)})
        },
        title: `Push ${getPageTitle(page.meta)}`,
      })),
      {concurrent: false, exitOnError: false, renderer: this.jsonEnabled() ? 'silent' : 'default'},
    ).run()

    if (this.failedCount > 0) {
      this.error(`${this.failedCount} page${this.failedCount === 1 ? '' : 's'} failed to push.`)
    }

    if (this.dryRun) return {pushed, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All pages pushed.')
    return {pushed, status: 'success'}
  }

  // Renames the local file pair to the `<id>-<slug>` convention used by `page pull` whenever it
  // doesn't already match, same principle as ensureCanonicalFilename in commands/snippet/push.ts:
  // the id is persisted into the sidecar before any rename, so a crash mid-rename still leaves a
  // valid, matchable pair on disk instead of an orphaned one that would be recreated as a duplicate.
  private async ensureCanonicalFilename(page: LocalPage, id: number, title: string): Promise<void> {
    const dir = dirname(page.contentPath)
    const canonicalBase = pageFileBase(id, title)
    const currentBase = basename(page.contentPath, '.html')

    const meta = {...page.meta, id}
    await writeFile(page.metaPath, JSON.stringify(meta, null, 2) + '\n')

    if (currentBase === canonicalBase) return

    await rename(page.contentPath, join(dir, `${canonicalBase}.html`))
    await rename(page.metaPath, join(dir, `${canonicalBase}.json`))
  }

  // A page is its `.html` content file plus an optional `.json` sidecar for everything else
  // (a fresh hand-created page may have no sidecar yet). One page is read in isolation: a
  // corrupted or hand-broken sidecar must only skip that page, not abort loading the rest of
  // the directory, same principle as commands/form/push.ts.
  private async loadFiles(dir: string): Promise<LocalPage[]> {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    const pages: LocalPage[] = []
    for (const file of files) {
      if (extname(file) !== '.html') continue

      const contentPath = join(dir, file)
      const metaPath = join(dir, `${basename(file, '.html')}.json`)

      let meta: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(await readFile(metaPath, 'utf8')) as unknown
        if (typeof parsed !== 'object' || parsed === null) {
          this.warn(`Skipping "${metaPath}": not a JSON object`)
          continue
        }

        meta = parsed as Record<string, unknown>
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.warn(`Skipping "${metaPath}": ${(error as Error).message}`)
          continue
        }
      }

      let content: string
      try {
        content = await readFile(contentPath, 'utf8')
      } catch (error) {
        this.warn(`Skipping "${contentPath}": ${(error as Error).message}`)
        continue
      }

      pages.push({content, contentPath, meta, metaPath})
    }

    return pages
  }

  // PUT-then-404-fallback-POST, same dance as commands/form/push.ts: pages are id-based.
  //
  // ponytail: `parent` round-trips as the source site's numeric page id untouched, so pushing
  // to a site where that id belongs to a different page (or nothing) silently mis-parents or
  // orphans the page. No id-remapping across sites here; fine for same-hierarchy environments,
  // revisit if pushing across sites with divergent page trees becomes a real workflow.
  private async pushPage(page: LocalPage, task?: {output: string}): Promise<null | number> {
    const title = getPageTitle(page.meta)

    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${title}`
      return getPageId(page.meta)
    }

    try {
      let id = getPageId(page.meta)
      const payload = {...page.meta, content: page.content}

      if (id === null) {
        const created = await this.wp.post<Record<string, unknown>>(PAGE_ENDPOINT, payload)
        id = getPageId(created)
        if (id !== null) await this.ensureCanonicalFilename(page, id, title)
      } else {
        try {
          await this.wp.put(`${PAGE_ENDPOINT}/${id}`, payload)
          await this.ensureCanonicalFilename(page, id, title)
        } catch (error) {
          // The id recorded locally doesn't exist on this site (e.g. a fresh install): create
          // it instead of failing, and adopt whatever id the site assigns. WordPress core
          // rejects any POST that still carries a (now stale) `id` field with a 400 "Cannot
          // create existing post", regardless of whether that id actually exists, so it must
          // be stripped before falling back to create.
          if (!isNotFoundError(error)) throw error

          const createPayload: Record<string, unknown> = {...payload}
          delete createPayload.id
          const created = await this.wp.post<Record<string, unknown>>(PAGE_ENDPOINT, createPayload)
          id = getPageId(created)
          if (id !== null) await this.ensureCanonicalFilename(page, id, title)
        }
      }

      if (task) task.output = `Pushed: ${title}`
      return id
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${title}: ${(error as Error).message}`, error, task)
    }
  }
}
