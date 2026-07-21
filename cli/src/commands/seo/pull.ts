import {Args, Flags} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises'
import {extname, join} from 'node:path'
import slugify from 'slugify'

import {LoopressCommand} from '../../lib/base.js'
import {
  DEFAULT_POST_TYPES,
  SEO_REDIRECTS_ENDPOINT,
  SEO_SETTINGS_ENDPOINT,
  SeoPostMeta,
  seoPostMetaEndpoint,
  SeoRedirect,
} from '../../utils/seo-format.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to SEO directory (overrides project config)'}),
  }
  static description = 'Pull SEO settings, post meta, and (if supported) redirects from WordPress'
  static examples = ['$ lps seo pull', '$ lps seo pull --post-type post --post-type page']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    'post-type': Flags.string({description: 'Limit post meta to specific post types', multiple: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveSeoPath(args.path)
    const postTypes = flags['post-type'] && flags['post-type'].length > 0 ? flags['post-type'] : [...DEFAULT_POST_TYPES]

    this.log(`Pulling SEO configuration from ${url}`)
    this.log(`SEO path: ${path}`)

    await this.pullSettings(path)
    for (const postType of postTypes) {
      await this.pullPostMeta(postType, path)
    }

    await this.pullRedirects(path)
  }

  // Shared by post-meta (`<slug>.json`) and redirects (`<id>-<slug>.json`) directories: a local
  // file whose identity is no longer in the current remote list belongs to something deleted on
  // WordPress. Left on disk, it would silently come back to life on the next `seo push`.
  private async findOrphanedFiles(dir: string, keepKeys: Set<string>, numericIdPrefix: boolean): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    return files.filter((file) => {
      if (extname(file) !== '.json') return false

      if (numericIdPrefix) {
        const match = /^(\d+)-/.exec(file)
        return match !== null && !keepKeys.has(match[1])
      }

      return !keepKeys.has(file.slice(0, -'.json'.length))
    })
  }

  private async pullPostMeta(postType: string, basePath: string): Promise<void> {
    const dir = join(basePath, 'post-meta', postType)
    const remote = await this.wp.get<SeoPostMeta[]>(seoPostMetaEndpoint(postType))
    const orphans = await this.findOrphanedFiles(dir, new Set(remote.map((post) => post.slug)), false)

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${remote.length} ${postType} post-meta file(s) to ${dir}`)
      if (orphans.length > 0) {
        this.log(
          `[dry-run] Would remove ${orphans.length} local file${orphans.length === 1 ? '' : 's'} in ${dir} no longer present on WordPress: ${orphans.join(', ')}`,
        )
      }

      return
    }

    if (remote.length > 0) await mkdir(dir, {recursive: true})

    await new Listr(
      remote.map((post) => ({
        async task(_ctx, task) {
          await writeFile(join(dir, `${post.slug}.json`), JSON.stringify(post, null, 2) + '\n')
          task.output = `Pulled: ${post.slug}`
        },
        title: `Pull ${post.slug}`,
      })),
    ).run()

    for (const file of orphans) await rm(join(dir, file), {force: true})
    if (orphans.length > 0) {
      this.warn(
        `Removed ${orphans.length} local file${orphans.length === 1 ? '' : 's'} in ${dir} no longer present on WordPress: ${orphans.join(', ')}`,
      )
    }

    this.log(`Pulled ${remote.length} ${postType} post-meta file(s) to ${dir}`)
  }

  // Redirects are only supported by some SeoProvider backends (RankMath, not Yoast). Unlike
  // push (which must fail loudly if the user has local redirect files that can't be synced),
  // pull degrades gracefully here: the active plugin never supporting redirects isn't an error
  // in the same sense a deleted-on-WordPress file is, there's simply nothing to pull.
  private async pullRedirects(basePath: string): Promise<void> {
    const dir = join(basePath, 'redirects')
    let remote: SeoRedirect[]
    try {
      remote = await this.wp.get<SeoRedirect[]>(SEO_REDIRECTS_ENDPOINT)
    } catch (error) {
      this.warn(`Skipping redirects: ${(error as Error).message}`)
      return
    }

    const orphans = await this.findOrphanedFiles(dir, new Set(remote.map((redirect) => String(redirect.id))), true)

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${remote.length} redirect(s) to ${dir}`)
      if (orphans.length > 0) {
        this.log(
          `[dry-run] Would remove ${orphans.length} local file${orphans.length === 1 ? '' : 's'} in ${dir} no longer present on WordPress: ${orphans.join(', ')}`,
        )
      }

      return
    }

    if (remote.length > 0) await mkdir(dir, {recursive: true})

    await new Listr(
      remote.map((redirect) => ({
        async task(_ctx, task) {
          await writeFile(join(dir, `${redirectFileBase(redirect)}.json`), JSON.stringify(redirect, null, 2) + '\n')
          task.output = `Pulled: redirect #${redirect.id}`
        },
        title: `Pull redirect #${redirect.id}`,
      })),
    ).run()

    for (const file of orphans) await rm(join(dir, file), {force: true})
    if (orphans.length > 0) {
      this.warn(
        `Removed ${orphans.length} local file${orphans.length === 1 ? '' : 's'} in ${dir} no longer present on WordPress: ${orphans.join(', ')}`,
      )
    }

    this.log(`Pulled ${remote.length} redirect(s) to ${dir}`)
  }

  private async pullSettings(basePath: string): Promise<void> {
    const file = join(basePath, 'settings.json')
    const settings = await this.wp.get<Record<string, unknown>>(SEO_SETTINGS_ENDPOINT)

    if (this.dryRun) {
      this.log(`[dry-run] Would pull settings to ${file}`)
      return
    }

    await mkdir(basePath, {recursive: true})
    await writeFile(file, JSON.stringify(settings, null, 2) + '\n')
    this.log(`Pulled settings to ${file}`)
  }
}

export function redirectFileBase(redirect: SeoRedirect): string {
  const slug = slugify(redirect.urlTo || 'redirect', {lower: true, strict: true})
  return `${redirect.id}-${slug || 'redirect'}`
}
