import {confirm} from '@inquirer/prompts'
import {Args} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {guardProductionPush} from '../../lib/guard-production-push.js'
import {isInteractive} from '../../lib/interactive.js'

type RemoveResult = {
  deleted: boolean
  name: string
  status: 'aborted' | 'dry-run' | 'success'
}

export default class Remove extends LoopressCommand {
  static args = {
    name: Args.string({description: 'App to remove from WordPress', required: true}),
  }

  static description =
    'Remove a single-page app from WordPress: deletes its bundle from wp-content/loopress/apps/ and unregisters the shortcode. Local files are left untouched.'

  static enableJsonFlag = true
  static examples = ['$ lps app remove search']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<RemoveResult> {
    const {args} = await this.parse(Remove)
    const {name} = args
    const {url} = this.siteConfig

    if (this.dryRun) {
      this.log(`[dry-run] Would delete app "${name}" from ${url}`)
      return {deleted: false, name, status: 'dry-run'}
    }

    await guardProductionPush({
      dryRun: this.dryRun,
      error: (message) => this.error(message),
      siteConfig: this.siteConfig,
      yes: this.yes,
    })

    if (!this.yes && isInteractive()) {
      const isProceed = await confirm({default: false, message: `Delete app "${name}" from ${url}?`})
      if (!isProceed) {
        this.log('Aborted.')
        return {deleted: false, name, status: 'aborted'}
      }
    }

    await this.wp.delete(`loopress/v1/apps/${name}`)
    this.log(`Removed app "${name}" from ${url}`)
    return {deleted: true, name, status: 'success'}
  }
}
