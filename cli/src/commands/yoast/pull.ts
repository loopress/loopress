import {Args, Flags} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises'
import {extname, join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {DEFAULT_POST_TYPES, YOAST_SETTINGS_ENDPOINT, YoastPostMeta, yoastPostMetaEndpoint} from '../../utils/yoast-format.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to Yoast directory (overrides project config)'}),
  }
  static description = 'Pull Yoast SEO settings and post meta from WordPress'
  static examples = ['$ lps yoast pull', '$ lps yoast pull --post-type post --post-type page']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    'post-type': Flags.string({description: 'Limit post meta to specific post types', multiple: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveYoastPath(args.path)
    const postTypes = flags['post-type'] && flags['post-type'].length > 0 ? flags['post-type'] : [...DEFAULT_POST_TYPES]

    this.log(`Pulling Yoast SEO configuration from ${url}`)
    this.log(`Yoast path: ${path}`)

    await this.pullSettings(path)
    for (const postType of postTypes) {
      await this.pullPostMeta(postType, path)
    }
  }

  // A local `<slug>.json` post-meta file no longer in the current remote list belongs to a post
  // that's no longer published under that slug (deleted, renamed, or unpublished). Left on
  // disk, it would silently come back to life on the next `yoast push` (same reasoning as
  // acf/pull.ts and rankmath/pull.ts).
  private async findOrphanedFiles(dir: string, keepSlugs: Set<string>): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    return files.filter((file) => extname(file) === '.json' && !keepSlugs.has(file.slice(0, -'.json'.length)))
  }

  private async pullPostMeta(postType: string, basePath: string): Promise<void> {
    const dir = join(basePath, 'post-meta', postType)
    const remote = await this.wp.get<YoastPostMeta[]>(yoastPostMetaEndpoint(postType))
    const orphans = await this.findOrphanedFiles(dir, new Set(remote.map((post) => post.slug)))

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

  private async pullSettings(basePath: string): Promise<void> {
    const file = join(basePath, 'settings.json')
    const settings = await this.wp.get<Record<string, unknown>>(YOAST_SETTINGS_ENDPOINT)

    if (this.dryRun) {
      this.log(`[dry-run] Would pull settings to ${file}`)
      return
    }

    await mkdir(basePath, {recursive: true})
    await writeFile(file, JSON.stringify(settings, null, 2) + '\n')
    this.log(`Pulled settings to ${file}`)
  }
}
