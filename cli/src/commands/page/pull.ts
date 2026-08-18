import {Args} from '@oclif/core'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {findOrphanedFiles, numericPrefixKey} from '../../lib/find-orphaned-files.js'
import {getPageContent, getPageId, getPageTitle, PAGE_ENDPOINT, PAGE_LIST_QUERY, pageFileBase, pickPageMeta} from '../../utils/page-format.js'
import {pluralize} from '../../utils/pluralize.js'

type PulledPage = {
  id: number
  title: string
}

type PullResult = {
  orphans: string[]
  pulled: PulledPage[]
  skipped: number
  status: 'dry-run' | 'success'
}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to pages directory (overrides project config)'}),
  }

  static description = 'Pull pages from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps page pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<PullResult> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolvePagePath(args.path)

    this.log(`Pulling pages from ${url}`)
    this.log(`Pages path: ${path}`)

    // context=edit returns title/content/excerpt as raw editable source instead of rendered
    // HTML, needed for the file to be a faithful, re-pushable copy (requires edit_pages).
    const remoteList = await this.wp.get<Array<Record<string, unknown>>>(`${PAGE_ENDPOINT}?${PAGE_LIST_QUERY}&context=edit`)
    const withId = remoteList.filter((page) => getPageId(page) !== null)
    const skipped = remoteList.length - withId.length

    // Every page writes an `.html` (content) and `.json` (everything else) pair; both
    // extensions are candidates for orphan cleanup, same principle as `snippet pull`.
    const orphans = await findOrphanedFiles(path, new Set(withId.map((page) => String(getPageId(page)))), {
      extensions: ['.json', '.html'],
      key: numericPrefixKey,
    })

    const pulled = withId.map((page) => ({id: getPageId(page)!, title: getPageTitle(page)}))

    await this.pullDirectory(path, withId, orphans, {
      dryRunMessage: `Would pull ${pluralize(withId.length, 'page')} to ${path}`,
      orphanReason: `in ${path} no longer present on WordPress`,
      pulledMessage: `Pulled ${pluralize(withId.length, 'page')} to ${path}`,
      title: (page) => getPageTitle(page),
      async write(page, writeDir) {
        const base = pageFileBase(getPageId(page)!, getPageTitle(page))
        // `content` lives entirely in the `.html` file; the `.json` sidecar keeps only the
        // fields WordPress actually accepts back on write, see pickPageMeta.
        await writeFile(join(writeDir, `${base}.html`), getPageContent(page))
        await writeFile(join(writeDir, `${base}.json`), JSON.stringify(pickPageMeta(page), null, 2) + '\n')
      },
    })

    if (this.dryRun) return {orphans, pulled, skipped, status: 'dry-run'}

    if (skipped > 0) {
      this.warn(`${pluralize(skipped, 'page')} skipped because they have no id`)
    }

    return {orphans, pulled, skipped, status: 'success'}
  }
}
