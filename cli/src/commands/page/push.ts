import {confirm} from '@inquirer/prompts'
import {Args} from '@oclif/core'

import {isInteractive} from '../../lib/interactive.js'
import {errorMessage} from '../../lib/narrow.js'
import {type PushChange, PushCommand} from '../../lib/push-command.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {isConflictCode} from '../../lib/wp-client.js'
import {formatPageProblems, frontPageNote, type Page, PAGES_ENDPOINT, type PushedPage, readLocalPages} from '../../utils/page-format.js'
import {pluralize} from '../../utils/pluralize.js'
import {resolveResourceDir} from '../../utils/resource-dirs.js'

type PushResult = {
  changes?: PushChange[]
  pushed: string[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static override args = {
    slug: Args.string({description: 'Push only this page (its file name without .html). Pushes every page when omitted.'}),
  }

  static override description =
    'Push local static HTML pages (pages/<slug>.html) to WordPress, or only one when a slug is given. The `status` header (draft or publish, draft by default) is applied on every push.'

  static override enableJsonFlag = true
  static override examples = ['$ lps page push', '$ lps page push legal-notice', '$ lps page push --dry-run', '$ lps page push about --overwrite']
  static override flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  // Pages the site refused because a same-slug page exists there that Loopress didn't create.
  private readonly unmanaged: Page[] = []

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
    const provider = getResourceStateProvider('page')
    const beforeState = await this.captureBeforePushState(provider, path, args.slug === undefined ? undefined : (id) => id === args.slug)

    const pushed: string[] = []
    await this.runPushTasks(
      selected,
      (page) => page.slug,
      async (page, task) => {
        if (await this.pushPage(page, task)) pushed.push(page.slug)
      },
    )
    await this.adoptUnmanaged(pushed)

    await this.writeAfterPushSnapshot(provider, path, beforeState)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'page')} failed to push.`)
    }

    if (this.dryRun) return {changes: this.previewChanges, pushed, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All pages pushed.')
    return {pushed, status: 'success'}
  }

  // One prompt for every page the first pass set aside, then a second pass that takes them over.
  // Without a terminal to ask in, they count as failed: CI must opt in with --overwrite.
  private async adoptUnmanaged(pushed: string[]): Promise<void> {
    if (this.unmanaged.length === 0) return

    const slugs = this.unmanaged.map((page) => page.slug)
    this.warn(
      `Already on ${this.siteConfig.url} but not created by Loopress: ${slugs.join(', ')}. ` +
        'Taking them over keeps their URL and ID, and shows your file instead of their current content (saved as a WordPress revision first). ' +
        'Pass --overwrite to take them over.',
    )

    if (!isInteractive() || !(await confirm({default: false, message: `Take over ${pluralize(slugs.length, 'page')}?`}))) {
      this.failedCount += slugs.length
      return
    }

    await this.runPushTasks(
      this.unmanaged,
      (page) => page.slug,
      async (page, task) => {
        if (await this.pushPage(page, task, true)) pushed.push(page.slug)
      },
    )
  }

  // Resolves false when the page was set aside for adoptUnmanaged instead of pushed.
  private async pushPage(page: Page, task?: {output: string; skip?: (message: string) => void}, adopt = this.overwrite): Promise<boolean> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${page.slug} (${page.status})`
      return true
    }

    try {
      const result = await this.wp.put<PushedPage>(PAGES_ENDPOINT, adopt ? {...page, adopt} : page)
      if (task) task.output = `Pushed: ${page.slug} (${result.status}) ${result.link}${frontPageNote(result)}`
      return true
    } catch (error) {
      if (!adopt && isConflictCode(error, 'loopress_page_not_managed')) {
        this.unmanaged.push(page)
        // skip(): Listr's own "skipped" mark, not the green check of a page that was pushed.
        task?.skip?.(`${page.slug} already exists on the site, not created by Loopress`)
        return false
      }

      this.reportTaskFailure(`Failed to push ${page.slug}: ${errorMessage(error)}`, error, task)
    }
  }
}
