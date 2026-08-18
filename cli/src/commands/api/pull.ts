import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {basenameKey, findOrphanedFiles} from '../../lib/find-orphaned-files.js'
import {pluralize} from '../../utils/pluralize.js'

type ApiFile = {
  content: string
  filename: string
}

type PullResult = {
  orphans: string[]
  pulled: string[]
  status: 'dry-run' | 'success'
}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to api directory (overrides project config)'}),
  }

  static description = 'Pull custom API route files from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps api pull', '$ lps api pull --path ./api']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<PullResult> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveApiPath(args.path)

    this.log(`Pulling API routes from ${url}`)
    this.log(`API path: ${path}`)

    const files = await this.wp.get<ApiFile[]>('loopress/v1/api-files')

    // A `<filename>.php` no longer present remotely belongs to a route deleted on WordPress
    // (push itself stays additive-only, but pull already cleans up locally, same as
    // `snippet pull`).
    const orphans = await findOrphanedFiles(path, new Set(files.map((file) => file.filename)), {
      extensions: ['.php'],
      key: basenameKey,
      recursive: true,
    })

    const pulled = files.map((file) => file.filename)

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${pluralize(files.length, 'route file')} to ${path}`)
      if (orphans.length > 0) {
        this.log(
          `[dry-run] Would remove ${pluralize(orphans.length, 'local file')} whose route no longer exists on WordPress: ${orphans.join(', ')}`,
        )
      }

      return {orphans, pulled, status: 'dry-run'}
    }

    await mkdir(path, {recursive: true})

    await new Listr(
      files.map((file) => ({
        async task(_ctx, task) {
          const filePath = join(path, `${file.filename}.php`)
          // filename can contain '/' (a path-param route, e.g. invoice-pdf/[order_id]):
          // writeFile() doesn't create parent directories on its own the way mkdir()'s
          // recursive option does above for the top-level path.
          await mkdir(dirname(filePath), {recursive: true})
          await writeFile(filePath, file.content)
          task.output = `Pulled: ${file.filename}`
        },
        title: `Pull ${file.filename}`,
      })),
      {renderer: this.jsonEnabled() ? 'silent' : 'default'},
    ).run()

    await this.removeOrphanedFiles(path, orphans, 'whose route no longer exists on WordPress')

    this.log(`Pulled ${pluralize(files.length, 'route file')} to ${path}`)

    return {orphans, pulled, status: 'success'}
  }
}
