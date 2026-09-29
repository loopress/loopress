import {Args} from '@oclif/core'

import {PushCommand} from '../../lib/push-command.js'
import {formatPageProblems} from '../../utils/page-format.js'
import {pluralize} from '../../utils/pluralize.js'
import {resolveResourceDir} from '../../utils/resource-dirs.js'
import {readLocalTemplates, type Template, TEMPLATES_ENDPOINT} from '../../utils/template-format.js'

type PushResult = {
  pushed: string[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static args = {
    slug: Args.string({description: 'Push only this template (its file name without .html). Pushes every template when omitted.'}),
  }

  static description =
    'Push block templates (templates/<slug>.html) to the active block theme. A static page uses one with its `template` header.'

  static enableJsonFlag = true
  static examples = ['$ lps template push', '$ lps template push landing', '$ lps template push --dry-run']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
    const {args} = await this.parse(Push)
    const path = resolveResourceDir('template', this.localConfig)

    this.log(`Pushing templates to ${this.siteConfig.url}`)
    this.log(`Templates path: ${path}`)

    const {problems, templates} = await readLocalTemplates(path)
    if (problems.length > 0) {
      this.error(`Nothing was pushed, fix these templates first:\n  ${formatPageProblems(problems)}`)
    }

    const selected = args.slug === undefined ? templates : templates.filter((template) => template.slug === args.slug)
    if (args.slug !== undefined && selected.length === 0) {
      this.error(`No template "${args.slug}" in ${path} (expected ${args.slug}.html).`)
    }

    this.log(`Found ${pluralize(selected.length, 'template')} to push`)

    const pushed: string[] = []
    await this.runPushTasks(
      selected,
      (template) => template.slug,
      async (template, task) => {
        await this.pushTemplate(template, task)
        pushed.push(template.slug)
      },
    )

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'template')} failed to push.`)
    }

    if (this.dryRun) return {pushed, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All templates pushed.')
    return {pushed, status: 'success'}
  }

  private async pushTemplate(template: Template, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${template.slug}`
      return
    }

    try {
      await this.wp.put<Template>(TEMPLATES_ENDPOINT, template)
      if (task) task.output = `Pushed: ${template.slug}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${template.slug}: ${(error as Error).message}`, error, task)
    }
  }
}
