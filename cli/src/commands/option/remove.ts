import {confirm} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {rm} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {guardProductionPush} from '../../lib/guard-production-push.js'
import {isInteractive} from '../../lib/interactive.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {optionEndpoint, optionFileName} from '../../utils/option-format.js'

type RemoveResult = {
  deletedRemote: boolean
  name: string
  status: 'aborted' | 'dry-run' | 'success'
}

export default class Remove extends LoopressCommand {
  static args = {
    name: Args.string({description: 'Option name to stop tracking', required: true}),
  }

  static description =
    'Stop tracking an option locally and delete it from WordPress. Local untracking always happens (git-reversible); ' +
    'pass --local-only to skip the WordPress delete and only stop tracking.'

  static enableJsonFlag = true
  static examples = ['$ lps option remove wpseo_titles', '$ lps option remove wpseo_titles --local-only']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
    'local-only': Flags.boolean({description: 'Untrack locally without deleting the option on WordPress'}),
    path: Flags.string({description: 'Path to options directory (overrides project config)'}),
  }

  async run(): Promise<RemoveResult> {
    const {args, flags} = await this.parse(Remove)
    const {name} = args
    const dir = this.resolveOptionsPath(flags.path)
    const {url} = this.siteConfig
    const file = join(dir, optionFileName(name))
    const localOnly = flags['local-only']

    if (this.dryRun) {
      const andDelete = localOnly ? '' : ` and delete it from ${url}`
      this.log(`[dry-run] Would untrack "${name}" locally${andDelete}`)
      return {deletedRemote: false, name, status: 'dry-run'}
    }

    if (localOnly) {
      await rm(file, {force: true})
      this.log(`Untracked "${name}" locally (left untouched on ${url})`)
      return {deletedRemote: false, name, status: 'success'}
    }

    await guardProductionPush({
      dryRun: this.dryRun,
      error: (message) => this.error(message),
      siteConfig: this.siteConfig,
      yes: this.yes,
    })

    if (!this.yes && isInteractive()) {
      const isProceed = await confirm({default: false, message: `Delete option "${name}" from ${url}? (local tracking also stops)`})
      if (!isProceed) {
        this.log('Aborted.')
        return {deletedRemote: false, name, status: 'aborted'}
      }
    }

    let deletedRemote = true
    try {
      await this.wp.delete(optionEndpoint(name))
    } catch (error) {
      if (!isNotFoundError(error)) throw error
      deletedRemote = false
    }

    await rm(file, {force: true})
    this.log(
      deletedRemote
        ? `Removed "${name}" from ${url} and untracked it locally`
        : `"${name}" was already absent on ${url}; untracked it locally`,
    )
    return {deletedRemote, name, status: 'success'}
  }
}
