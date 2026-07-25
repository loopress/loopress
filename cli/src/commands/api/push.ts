import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {readdir, readFile} from 'node:fs/promises'
import {extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'

interface ApiFile {
  content: string
  filename: string
}

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to api directory (overrides project config)'}),
  }
  static description = 'Push custom API route files to WordPress'
  static examples = ['$ lps api push', '$ lps api push --path ./api']
  static flags = {
    ...PushCommand.dryRunFlag,
  }
  private failedCount = 0

  async run(): Promise<void> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveApiPath(args.path)

    this.log(`Pushing API routes to ${url}`)
    this.log(`API path: ${path}`)

    const files = await this.loadFiles(path)
    this.log(`Found ${files.length} route file${files.length === 1 ? '' : 's'} to push`)

    await new Listr(
      files.map((file) => ({
        task: async (_ctx, task) => this.pushFile(file, task),
        title: `Push ${file.filename}`,
      })),
      {concurrent: false, exitOnError: false},
    ).run()

    if (this.failedCount > 0) {
      this.error(`${this.failedCount} route file${this.failedCount === 1 ? '' : 's'} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All API routes pushed.')
  }

  private async loadFiles(path: string): Promise<ApiFile[]> {
    let entries: string[]
    try {
      entries = await readdir(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    const files: ApiFile[] = []
    for (const entry of entries) {
      if (extname(entry) !== '.php') continue

      const content = await readFile(join(path, entry), 'utf8')
      files.push({content, filename: entry.slice(0, -4)})
    }

    return files
  }

  private async pushFile(file: ApiFile, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${file.filename}`

      return
    }

    try {
      await this.wp.put(`loopress/v1/api-files/${file.filename}`, {content: file.content})
      if (task) task.output = `Pushed: ${file.filename}`
    } catch (error) {
      const message = `Failed to push ${file.filename}: ${(error as Error).message}`
      if (task) task.output = message
      else this.warn(`  ${message}`)

      this.failedCount++
      throw error
    }
  }
}
