import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {readdir, readFile} from 'node:fs/promises'
import {extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {YOAST_SETTINGS_ENDPOINT, YoastPostMeta, yoastPostMetaEndpoint} from '../../utils/yoast-format.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to Yoast directory (overrides project config)'}),
  }
  static description = 'Push Yoast SEO settings and post meta to WordPress'
  static examples = ['$ lps yoast push']
  static flags = {
    ...PushCommand.dryRunFlag,
  }
  private failedCount = 0

  async run(): Promise<void> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveYoastPath(args.path)

    this.log(`Pushing Yoast SEO configuration to ${url}`)
    this.log(`Yoast path: ${path}`)

    await this.pushSettings(path)
    await this.pushPostMeta(path)

    if (this.failedCount > 0) {
      this.error(`${this.failedCount} Yoast item${this.failedCount === 1 ? '' : 's'} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All Yoast SEO configuration pushed.')
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
      let files: string[]
      try {
        files = (await readdir(dir)).filter((file) => extname(file) === '.json')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue

        throw error
      }

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
      const post = JSON.parse(await readFile(filePath, 'utf8')) as YoastPostMeta
      await this.wp.post(yoastPostMetaEndpoint(postType), {meta: post.meta, slug: post.slug})
      if (task) task.output = `Pushed: ${post.slug}`
    } catch (error) {
      const message = `Failed to push ${filePath}: ${(error as Error).message}`
      if (task) task.output = message
      else this.warn(`  ${message}`)

      this.failedCount++
      throw error
    }
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
      await this.wp.put(YOAST_SETTINGS_ENDPOINT, JSON.parse(raw) as Record<string, unknown>)
      this.log(`Pushed: ${file}`)
    } catch (error) {
      this.failedCount++
      this.warn(`Failed to push ${file}: ${(error as Error).message}`)
    }
  }
}
