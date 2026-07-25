import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'

interface ApiFile {
  content: string
  filename: string
}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to api directory (overrides project config)'}),
  }
  static description = 'Pull custom API route files from WordPress'
  static examples = ['$ lps api pull', '$ lps api pull --path ./api']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveApiPath(args.path)

    this.log(`Pulling API routes from ${url}`)
    this.log(`API path: ${path}`)

    const files = await this.wp.get<ApiFile[]>('loopress/v1/api-files')

    // Files following the `<filename>.php` convention no longer present remotely belong to
    // a route deleted on WordPress. Left on disk, they'd silently come back to life the next
    // time `api push` runs (see obsidian/Product/Push Deletion Rules.md: push itself stays
    // additive-only, but pull already cleans up locally, same as `snippet pull`).
    const orphans = await this.findOrphanedFiles(
      path,
      new Set(files.map((file) => file.filename)),
    )

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${files.length} route file${files.length === 1 ? '' : 's'} to ${path}`)
      if (orphans.length > 0) {
        this.log(
          `[dry-run] Would remove ${orphans.length} local file${orphans.length === 1 ? '' : 's'} whose route no longer exists on WordPress: ${orphans.join(', ')}`,
        )
      }

      return
    }

    await mkdir(path, {recursive: true})

    await new Listr(
      files.map((file) => ({
        async task(_ctx, task) {
          await writeFile(join(path, `${file.filename}.php`), file.content)
          task.output = `Pulled: ${file.filename}`
        },
        title: `Pull ${file.filename}`,
      })),
    ).run()

    for (const file of orphans) await rm(join(path, file), {force: true})
    if (orphans.length > 0) {
      this.warn(
        `Removed ${orphans.length} local file${orphans.length === 1 ? '' : 's'} whose route no longer exists on WordPress: ${orphans.join(', ')}`,
      )
    }

    this.log(`Pulled ${files.length} route file${files.length === 1 ? '' : 's'} to ${path}`)
  }

  // Only ever matches `.php` files already following the flat `<filename>.php` convention
  // that `api pull`/`push` themselves produce, so a hand-created non-.php file is never at
  // risk of being picked up here.
  private async findOrphanedFiles(path: string, keepFilenames: Set<string>): Promise<string[]> {
    let entries: string[]
    try {
      entries = await readdir(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    return entries.filter((entry) => entry.endsWith('.php') && !keepFilenames.has(entry.slice(0, -4)))
  }
}
