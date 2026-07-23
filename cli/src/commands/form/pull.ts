import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises'
import {extname, join} from 'node:path'
import slugify from 'slugify'

import {LoopressCommand} from '../../lib/base.js'
import {getWpFormsId, getWpFormsTitle, WPFORMS_ENDPOINT} from '../../utils/wpforms-format.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to WPForms directory (overrides project config)'}),
  }
  static description = 'Pull WPForms forms from WordPress'
  static examples = ['$ lps form pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveFormPath(args.path)

    this.log(`Pulling WPForms forms from ${url}`)
    this.log(`WPForms path: ${path}`)

    const remoteList = await this.wp.get<Record<string, unknown>[]>(WPFORMS_ENDPOINT)
    const withId = remoteList.filter((form) => getWpFormsId(form) !== null)
    const skipped = remoteList.length - withId.length

    const orphans = await this.findOrphanedFiles(path, new Set(withId.map((form) => getWpFormsId(form) as number)))

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${withId.length} form${withId.length === 1 ? '' : 's'} to ${path}`)
      if (orphans.length > 0) {
        this.log(
          `[dry-run] Would remove ${orphans.length} local file${orphans.length === 1 ? '' : 's'} in ${path} no longer present on WordPress: ${orphans.join(', ')}`,
        )
      }

      return
    }

    if (withId.length > 0) await mkdir(path, {recursive: true})

    await new Listr(
      withId.map((form) => {
        const id = getWpFormsId(form) as number
        const title = getWpFormsTitle(form)
        return {
          async task(_ctx, task) {
            await writeFile(join(path, `${id}-${slug(title)}.json`), JSON.stringify(form, null, 2) + '\n')
            task.output = `Pulled: ${title}`
          },
          title: `Pull ${title}`,
        }
      }),
    ).run()

    for (const file of orphans) await rm(join(path, file), {force: true})
    if (orphans.length > 0) {
      this.warn(
        `Removed ${orphans.length} local file${orphans.length === 1 ? '' : 's'} in ${path} no longer present on WordPress: ${orphans.join(', ')}`,
      )
    }

    this.log(`Pulled ${withId.length} form${withId.length === 1 ? '' : 's'} to ${path}`)
    if (skipped > 0) {
      this.warn(`${skipped} form${skipped === 1 ? '' : 's'} skipped because they have no id`)
    }
  }

  // Only matches files following the `<id>-<slug>.json` convention pull/push themselves
  // produce, same principle as findOrphanedFiles in commands/snippet/pull.ts.
  private async findOrphanedFiles(dir: string, keepIds: Set<number>): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    return files.filter((file) => {
      if (extname(file) !== '.json') return false

      const match = /^(\d+)-/.exec(file)
      return match !== null && !keepIds.has(Number(match[1]))
    })
  }
}

export function slug(title: string): string {
  return slugify(title, {lower: true, strict: true}) || 'untitled'
}
