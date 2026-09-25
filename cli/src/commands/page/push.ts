import {Args} from '@oclif/core'

import {PushCommand} from '../../lib/push-command.js'
import {formatPageProblems, frontPageNote, type Page, PAGES_ENDPOINT, type PushedPage, readLocalPages} from '../../utils/page-format.js'
import {pluralize} from '../../utils/pluralize.js'
import {resolveResourceDir} from '../../utils/resource-dirs.js'

type PushResult = {
  pushed: string[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static args = {
    slug: Args.string({description: 'Push only this page (its file name without .html). Pushes every page when omitted.'}),
  }

  static description =
    'Push static HTML pages (pages/<slug>.html) to WordPress. The `status` header (draft or publish, draft by default) is applied on every push.'

  static enableJsonFlag = true
  static examples = ['$ lps page push', '$ lps page push legal-notice', '$ lps page push --dry-run']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
    const {args} = await this.parse(Push)
    const path = resolveResourceDir('page', this.localConfig)

    this.log(`Pushing pages to ${this.siteConfig.url}`)
    this.log(`Pages path: ${path}`)

    const {pages, problems} = await readLocalPages(path)
    if (problems.length > 0) {
      this.error(`Nothing was pushed, fix these pages first:\n  ${formatPageProblems(problems)}`)
    }

    const selected = args.slug === undefined ? pages : pages.filter((page) => page.slug === args.slug)
    if (args.slug !== undefined && selected.length === 0) {
      this.error(`No page "${args.slug}" in ${path} (expected ${args.slug}.html).`)
    }

    this.log(`Found ${pluralize(selected.length, 'page')} to push`)

    const pushed: string[] = []
    await this.runPushTasks(
      selected,
      (page) => page.slug,
      async (page, task) => {
        await this.pushPage(page, task)
        pushed.push(page.slug)
      },
    )

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'page')} failed to push.`)
    }

    if (this.dryRun) return {pushed, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All pages pushed.')
    return {pushed, status: 'success'}
  }

  private async pushPage(page: Page, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${page.slug} (${page.status})`
      return
    }

    try {
      const result = await this.wp.put<PushedPage>(PAGES_ENDPOINT, page)
      if (task) task.output = `Pushed: ${page.slug} (${result.status}) ${result.link}${frontPageNote(result)}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${page.slug}: ${(error as Error).message}`, error, task)
    }
  }
}
