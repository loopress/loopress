import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {findOrphanedFiles, numericPrefixKey} from '../../lib/find-orphaned-files.js'
import {getPageContent, getPageId, getPageTitle, PAGE_ENDPOINT, PAGE_LIST_QUERY, pageFileBase, pickPageMeta} from '../../utils/page-format.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to pages directory (overrides project config)'}),
  }
  static description = 'Pull pages from WordPress'
  static examples = ['$ lps page pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolvePagePath(args.path)

    this.log(`Pulling pages from ${url}`)
    this.log(`Pages path: ${path}`)

    // context=edit returns title/content/excerpt as raw editable source instead of rendered
    // HTML, needed for the file to be a faithful, re-pushable copy (requires edit_pages).
    const remoteList = await this.wp.get<Record<string, unknown>[]>(`${PAGE_ENDPOINT}?${PAGE_LIST_QUERY}&context=edit`)
    const withId = remoteList.filter((page) => getPageId(page) !== null)
    const skipped = remoteList.length - withId.length

    // Every page writes an `.html` (content) and `.json` (everything else) pair; both
    // extensions are candidates for orphan cleanup, same principle as `snippet pull`.
    const orphans = await findOrphanedFiles(path, new Set(withId.map((page) => String(getPageId(page)))), {
      extensions: ['.json', '.html'],
      key: numericPrefixKey,
    })

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${withId.length} page${withId.length === 1 ? '' : 's'} to ${path}`)
      if (orphans.length > 0) {
        this.log(
          `[dry-run] Would remove ${orphans.length} local file${orphans.length === 1 ? '' : 's'} in ${path} no longer present on WordPress: ${orphans.join(', ')}`,
        )
      }

      return
    }

    if (withId.length > 0) await mkdir(path, {recursive: true})

    await new Listr(
      withId.map((page) => {
        const id = getPageId(page) as number
        const title = getPageTitle(page)
        return {
          async task(_ctx, task) {
            const base = pageFileBase(id, title)
            // `content` lives entirely in the `.html` file; the `.json` sidecar keeps only the
            // fields WordPress actually accepts back on write, see pickPageMeta.
            await writeFile(join(path, `${base}.html`), getPageContent(page))
            await writeFile(join(path, `${base}.json`), JSON.stringify(pickPageMeta(page), null, 2) + '\n')
            task.output = `Pulled: ${title}`
          },
          title: `Pull ${title}`,
        }
      }),
    ).run()

    await this.removeOrphanedFiles(path, orphans, `in ${path} no longer present on WordPress`)

    this.log(`Pulled ${withId.length} page${withId.length === 1 ? '' : 's'} to ${path}`)
    if (skipped > 0) {
      this.warn(`${skipped} page${skipped === 1 ? '' : 's'} skipped because they have no id`)
    }
  }
}
