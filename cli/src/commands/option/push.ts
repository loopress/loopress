import {Args} from '@oclif/core'

import {loadFiles} from '../../lib/load-files.js'
import {PushCommand} from '../../lib/push-command.js'
import {type LocalOption, optionEndpoint, parseLocalOption, partitionByReadonly} from '../../utils/option-format.js'
import {pluralize} from '../../utils/pluralize.js'

type PushResult = {
  pushed: string[]
  skipped: string[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to options directory (overrides project config)'}),
  }

  static description =
    'Push locally tracked, non-readonly options to WordPress (upsert only, never deletes an untracked option). ' +
    'Options marked "readonly": true in their local file are skipped, edit the file to override.'

  static enableJsonFlag = true
  static examples = ['$ lps option push']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
    const {args} = await this.parse(Push)
    const dir = this.resolveOptionsPath(args.path)
    const {url} = this.siteConfig

    this.log(`Pushing tracked options to ${url}`)
    this.log(`Options path: ${dir}`)

    const tracked = await loadFiles<LocalOption>(dir, {
      extension: '.json',
      onSkip: (message) => {
        this.warn(message)
      },
      parse: parseLocalOption,
    })

    const {skipped, writable} = partitionByReadonly(tracked)

    if (skipped.length > 0) {
      this.log(`Skipping ${pluralize(skipped.length, 'readonly option')}: ${skipped.map((option) => option.name).join(', ')}`)
    }

    this.log(`Found ${pluralize(writable.length, 'option')} to push`)

    const pushed: string[] = []

    await this.runPushTasks(
      writable,
      (option) => option.name,
      async (option, task) => {
        await this.pushOption(option, task)
        pushed.push(option.name)
      },
    )

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'option')} failed to push.`)
    }

    const skippedNames = skipped.map((option) => option.name)

    if (this.dryRun) return {pushed, skipped: skippedNames, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All options pushed.')
    return {pushed, skipped: skippedNames, status: 'success'}
  }

  private async pushOption(option: LocalOption, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${option.name}`
      return
    }

    try {
      await this.wp.put(optionEndpoint(option.name), {autoload: option.autoload, value: option.value})
      if (task) task.output = `Pushed: ${option.name}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${option.name}: ${(error as Error).message}`, error, task)
    }
  }
}
