import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {
  SEO_REDIRECTS_ENDPOINT,
  SEO_SETTINGS_ENDPOINT,
  SeoPostMeta,
  seoPostMetaEndpoint,
  SeoRedirect,
  seoRedirectEndpoint,
} from '../../utils/seo-format.js'
import {redirectFileBase} from './pull.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to SEO directory (overrides project config)'}),
  }
  static description =
    'Push SEO settings, post meta, and redirects to WordPress. Local redirect files created remotely are renamed on disk to the `<id>-<slug>` convention. Fails clearly per file if the active SEO plugin does not support redirects.'
  static examples = ['$ lps seo push']
  static flags = {
    ...PushCommand.dryRunFlag,
  }
  private failedCount = 0

  async run(): Promise<void> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveSeoPath(args.path)

    this.log(`Pushing SEO configuration to ${url}`)
    this.log(`SEO path: ${path}`)

    await this.pushSettings(path)
    await this.pushPostMeta(path)
    await this.pushRedirects(path)

    if (this.failedCount > 0) {
      this.error(`${this.failedCount} SEO item${this.failedCount === 1 ? '' : 's'} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All SEO configuration pushed.')
  }

  private async jsonFilesIn(dir: string): Promise<string[]> {
    try {
      return (await readdir(dir)).filter((file) => extname(file) === '.json')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }
  }

  private async pushPostMeta(basePath: string): Promise<void> {
    const root = join(basePath, 'post-meta')
    let postTypeDirs: string[]
    try {
      postTypeDirs = (await readdir(root, {withFileTypes: true})).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return

      throw error
    }

    for (const postType of postTypeDirs) {
      const dir = join(root, postType)
      const files = await this.jsonFilesIn(dir)
      if (files.length === 0) continue

      this.log(`Found ${files.length} ${postType} post-meta file${files.length === 1 ? '' : 's'} to push`)

      await new Listr(
        files.map((file) => ({
          task: async (_ctx, task) => this.pushPostMetaFile(postType, join(dir, file), task),
          title: `Push ${file}`,
        })),
        {concurrent: false, exitOnError: false},
      ).run()
    }
  }

  private async pushPostMetaFile(postType: string, filePath: string, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${filePath}`

      return
    }

    try {
      const post = JSON.parse(await readFile(filePath, 'utf8')) as SeoPostMeta
      await this.wp.post(seoPostMetaEndpoint(postType), {meta: post.meta, slug: post.slug})
      if (task) task.output = `Pushed: ${post.slug}`
    } catch (error) {
      const message = `Failed to push ${filePath}: ${(error as Error).message}`
      if (task) task.output = message
      else this.warn(`  ${message}`)

      this.failedCount++
      throw error
    }
  }

  private async pushRedirectFile(filePath: string, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${filePath}`

      return
    }

    try {
      const redirect = JSON.parse(await readFile(filePath, 'utf8')) as SeoRedirect
      const payload = {headerCode: redirect.headerCode, sources: redirect.sources, status: redirect.status, urlTo: redirect.urlTo}

      if (redirect.id) {
        try {
          await this.wp.put(seoRedirectEndpoint(redirect.id), payload)
          if (task) task.output = `Pushed: redirect #${redirect.id}`

          return
        } catch (error) {
          // The id recorded locally doesn't exist on this site (e.g. a fresh install): create it
          // instead of failing, and adopt whatever id the site assigns (same fallback as snippet push).
          if (!isNotFoundError(error)) throw error
        }
      }

      const created = await this.wp.post<SeoRedirect>(SEO_REDIRECTS_ENDPOINT, payload)
      await this.renameToCanonical(filePath, created)
      if (task) task.output = `Pushed: redirect #${created.id}`
    } catch (error) {
      const message = `Failed to push ${filePath}: ${(error as Error).message}`
      if (task) task.output = message
      else this.warn(`  ${message}`)

      this.failedCount++
      throw error
    }
  }

  private async pushRedirects(basePath: string): Promise<void> {
    const dir = join(basePath, 'redirects')
    const files = await this.jsonFilesIn(dir)
    if (files.length === 0) return

    this.log(`Found ${files.length} redirect${files.length === 1 ? '' : 's'} to push`)

    await new Listr(
      files.map((file) => ({
        task: async (_ctx, task) => this.pushRedirectFile(join(dir, file), task),
        title: `Push ${file}`,
      })),
      {concurrent: false, exitOnError: false},
    ).run()
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
      await this.wp.put(SEO_SETTINGS_ENDPOINT, JSON.parse(raw) as Record<string, unknown>)
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
