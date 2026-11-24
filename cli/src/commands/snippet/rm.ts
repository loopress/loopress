import {confirm} from '@inquirer/prompts'
import {Args} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {isInteractive} from '../../lib/interactive.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {SNIPPETS_ENDPOINT} from '../../utils/snippet-format.js'

type RmResult = {id: number; removed: boolean; status: 'aborted' | 'dry-run' | 'success'}

export default class Rm extends LoopressCommand {
  static override aliases = ['snippet:remove']
  static override args = {
    id: Args.integer({description: 'The id of the snippet to remove (see `lps snippet list`)', required: true, min: 1}),
  }

  static override description =
    'Remove one snippet from WordPress. Its local files are not touched: delete them too, or the next push creates the snippet again.'

  static override enableJsonFlag = true
  static override examples = ['$ lps snippet rm 12', '$ lps snippet remove 12 --yes']
  static override flags = {...LoopressCommand.dryRunFlag, ...LoopressCommand.yesFlag}

  async run(): Promise<RmResult> {
    const {args} = await this.parse(Rm)
    const {id} = args
    const {url} = this.siteConfig

    if (this.dryRun) {
      this.log(`[dry-run] Would remove snippet ${id} from ${url}`)
      return {id, removed: false, status: 'dry-run'}
    }

    if (!this.yes) {
      if (!isInteractive()) {
        this.error(`Removing snippet ${id} needs confirmation. Re-run with --yes.`)
      }

      if (!(await confirm({default: false, message: `Remove snippet ${id} from ${url}?`}))) {
        this.log('Aborted.')
        return {id, removed: false, status: 'aborted'}
      }
    }

    try {
      await this.wp.delete(`${SNIPPETS_ENDPOINT}/${id}`)
    } catch (error) {
      if (isNotFoundError(error)) this.error(`Snippet ${id} is not on ${url}.`)
      throw error
    }

    this.log(`Removed snippet ${id} from ${url}`)
    return {id, removed: true, status: 'success'}
  }
}
