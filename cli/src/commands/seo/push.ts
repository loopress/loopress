import {Args, Flags} from '@oclif/core'
import {readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {putOrCreate} from '../../lib/put-or-create.js'
import {readdirTolerant} from '../../lib/readdir-tolerant.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {pluralize} from '../../utils/pluralize.js'
import {
  redirectFileBase,
  type RemoteSeoPostMeta,
  type RemoteSeoSettings,
  SEO_REDIRECTS_ENDPOINT,
  SEO_SETTINGS_ENDPOINT,
  type SeoPostMeta,
  seoPostMetaEndpoint,
  seoPostMetaItemEndpoint,
  type SeoRedirect,
  seoRedirectEndpoint,
} from '../../utils/seo-format.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to SEO directory (overrides project config)'}),
  }

  static description =
    'Push SEO settings, post meta, and redirects to WordPress. Local redirect files created remotely are renamed on disk to the `<id>-<slug>` convention. Fails clearly per file if the active SEO plugin does not support redirects.'

  static examples = ['$ lps seo push', '$ lps seo push --allow-external-redirects']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
    'allow-external-redirects': Flags.boolean({
      default: false,
      description:
        'Allow pushing a redirect whose target points off this site. Off by default: the server rejects an off-site `urlTo` so a stray push can\'t 301 traffic away.',
    }),
  }

  private allowExternalRedirects = false

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveSeoPath(args.path)
    this.allowExternalRedirects = flags['allow-external-redirects']

    this.log(`Pushing SEO configuration to ${url}`)
    this.log(`SEO path: ${path}`)

    const provider = getResourceStateProvider('seo')
    const beforeState = await this.captureBeforePushState(provider, path)

    await this.pushSettings(path)
    await this.pushPostMeta(path)
    await this.pushRedirects(path)

    await this.writeAfterPushSnapshot(provider, path, beforeState)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'SEO item')} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All SEO configuration pushed.')
  }

  private async currentPostMetaRevision(postType: string, slug: string): Promise<string | undefined> {
    try {
      const current = await this.wp.get<RemoteSeoPostMeta>(seoPostMetaItemEndpoint(postType, slug))
      return current.revision
    } catch (error) {
      if (isNotFoundError(error)) return undefined
      throw error
    }
  }

  private async jsonFilesIn(dir: string): Promise<string[]> {
    return (await readdirTolerant(dir)).filter((file) => extname(file) === '.json')
  }

  private async pushPostMeta(basePath: string): Promise<void> {
    const root = join(basePath, 'post-meta')
    const postTypeDirs = (await readdirTolerant(root, {withFileTypes: true}))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    for (const postType of postTypeDirs) {
      const dir = join(root, postType)
      const files = await this.jsonFilesIn(dir)
      if (files.length === 0) continue

      this.log(`Found ${pluralize(files.length, postType + ' post-meta file')} to push`)

      await this.runPushTasks(
        files,
        (file) => file,
        async (file, task) => this.pushPostMetaFile(postType, join(dir, file), task),
      )
    }
  }

  private async pushPostMetaFile(postType: string, filePath: string, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${filePath}`

      return
    }

    try {
      const post = JSON.parse(await readFile(filePath, 'utf8')) as SeoPostMeta
      // Read the post's current SEO-meta revision right before writing it, and send it back as
      // `expectedRevision`: WordPress refuses the write (412) if something else changed that
      // post's meta in between, instead of this push silently overwriting it (#234). No revision
      // to condition on for a post whose meta doesn't exist remotely yet (an upsert that will
      // itself fail with a clearer "post not found" error): falls back to an unconditional write.
      const expectedRevision = await this.currentPostMetaRevision(postType, post.slug)
      const body: Record<string, unknown> = {meta: post.meta, slug: post.slug}
      if (expectedRevision !== undefined) body.expectedRevision = expectedRevision

      await this.wp.post(seoPostMetaEndpoint(postType), body)
      if (task) task.output = `Pushed: ${post.slug}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${filePath}: ${(error as Error).message}`, error, task)
    }
  }

  private async pushRedirectFile(filePath: string, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${filePath}`

      return
    }

    try {
      const redirect = JSON.parse(await readFile(filePath, 'utf8')) as SeoRedirect
      const payload = {
        headerCode: redirect.headerCode,
        sources: redirect.sources,
        status: redirect.status,
        urlTo: redirect.urlTo,
        ...(this.allowExternalRedirects && {allowExternal: true}),
      }

      // The id recorded locally may not exist on this site (e.g. a fresh install): putOrCreate
      // falls back to POST instead of failing, adopting whatever id the site assigns.
      const {body, created} = await putOrCreate<SeoRedirect>(this.wp, {
        id: redirect.id ?? null,
        payload,
        postEndpoint: SEO_REDIRECTS_ENDPOINT,
        putEndpoint: (id) => seoRedirectEndpoint(id),
      })

      if (created) await this.renameToCanonical(filePath, body)
      if (task) task.output = `Pushed: redirect #${created ? body.id : redirect.id}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${filePath}: ${(error as Error).message}`, error, task)
    }
  }

  private async pushRedirects(basePath: string): Promise<void> {
    const dir = join(basePath, 'redirects')
    const files = await this.jsonFilesIn(dir)
    if (files.length === 0) return

    this.log(`Found ${pluralize(files.length, 'redirect')} to push`)

    await this.runPushTasks(
      files,
      (file) => file,
      async (file, task) => this.pushRedirectFile(join(dir, file), task),
    )
  }

  private async pushSettings(basePath: string): Promise<void> {
    const file = join(basePath, 'settings.json')
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return

      throw error
    }

    if (this.dryRun) {
      this.log(`[dry-run] Would push: ${file}`)
      return
    }

    try {
      const settings = JSON.parse(raw) as Record<string, unknown>
      // Read the settings' current revision right before writing them, and send it back as
      // `expectedRevision`: WordPress refuses the write (412) if something else changed the
      // settings in between, instead of this push silently overwriting it (#234).
      const {revision} = await this.wp.get<RemoteSeoSettings>(SEO_SETTINGS_ENDPOINT)
      await this.wp.put(SEO_SETTINGS_ENDPOINT, {expectedRevision: revision, settings})
      this.log(`Pushed: ${file}`)
    } catch (error) {
      this.failedCount++
      this.warn(`Failed to push ${file}: ${(error as Error).message}`)
    }
  }

  private async renameToCanonical(filePath: string, redirect: SeoRedirect): Promise<void> {
    const dir = dirname(filePath)
    const canonicalPath = join(dir, `${redirectFileBase(redirect)}.json`)

    await writeFile(canonicalPath, JSON.stringify(redirect, null, 2) + '\n')
    if (canonicalPath !== filePath) await rm(filePath, {force: true})
  }
}
