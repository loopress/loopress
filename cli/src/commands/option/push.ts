import {Args} from '@oclif/core'

import {loadFiles} from '../../lib/load-files.js'
import {PushCommand} from '../../lib/push-command.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {type LocalOption, optionEndpoint, parseLocalOption, partitionByReadonly, type RemoteOption} from '../../utils/option-format.js'
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

    const provider = getResourceStateProvider('option')
    const beforeState = await this.captureBeforePushState(provider, dir)

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

    await this.writeAfterPushSnapshot(provider, dir, beforeState)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'option')} failed to push.`)
    }

    const skippedNames = skipped.map((option) => option.name)

    if (this.dryRun) return {pushed, skipped: skippedNames, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All options pushed.')
    return {pushed, skipped: skippedNames, status: 'success'}
  }

  private async currentRevision(name: string): Promise<string | undefined> {
    try {
      const current = await this.wp.get<RemoteOption>(optionEndpoint(name))
      return current.revision
    } catch (error) {
      if (isNotFoundError(error)) return undefined
      throw error
    }
  }

  private async pushOption(option: LocalOption, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${option.name}`
      return
    }

    try {
      // Read the option's current revision right before writing it, and send it back as
      // `expectedRevision`: WordPress refuses the write (412) if something else changed the
      // option in between, instead of this push silently overwriting it (#234). No revision to
      // condition on for an option that doesn't exist remotely yet (a first push, an upsert
      // create): falls back to today's unconditional write, same as before this existed.
      const expectedRevision = await this.currentRevision(option.name)
      const body: Record<string, unknown> = {autoload: option.autoload, value: option.value}
      if (expectedRevision !== undefined) body.expectedRevision = expectedRevision

      await this.wp.put(optionEndpoint(option.name), body)
      if (task) task.output = `Pushed: ${option.name}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${option.name}: ${(error as Error).message}`, error, task)
    }
  }
}
