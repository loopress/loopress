import {confirm} from '@inquirer/prompts'
import {Args} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {isInteractive} from '../../lib/interactive.js'
import {isApplicative404} from '../../lib/wp-client.js'
import {cptEndpoint} from '../../utils/cpt-format.js'

type RmResult = {removed: boolean; slug: string; status: 'aborted' | 'dry-run' | 'success'}

// The only way a Loopress post type leaves WordPress: `cpt push` never deletes (see Push
// Deletion Rules in the product docs). The local file is left alone, same as `hook rm`.
export default class Rm extends LoopressCommand {
  static aliases = ['cpt:remove']
  static args = {
    slug: Args.string({description: 'The post type slug, its cpt/ file name without .json', required: true}),
  }

  static description =
    'Stop registering a Loopress custom post type on WordPress. Its posts are kept in the database, hidden until the post type is pushed again.'

  static enableJsonFlag = true
  static examples = ['$ lps cpt rm book', '$ lps cpt remove book --yes']
  static flags = {...LoopressCommand.dryRunFlag, ...LoopressCommand.yesFlag}

  async run(): Promise<RmResult> {
    const {args} = await this.parse(Rm)
    const {slug} = args
    const {url} = this.siteConfig

    if (this.dryRun) {
      this.log(`[dry-run] Would remove post type ${slug} from ${url}`)
      return {removed: false, slug, status: 'dry-run'}
    }

    if (!this.yes) {
      if (!isInteractive()) this.error(`Removing post type ${slug} needs confirmation. Re-run with --yes.`)

      const ok = await confirm({default: false, message: `Remove post type ${slug} from ${url}? Its posts stay in the database, hidden.`})
      if (!ok) {
        this.log('Aborted.')
        return {removed: false, slug, status: 'aborted'}
      }
    }

    try {
      await this.wp.delete(cptEndpoint(slug))
    } catch (error) {
      if (isApplicative404(error, 'Post type not found')) this.error(`Post type ${slug} is not managed by Loopress on ${url}.`)
      throw error
    }

    this.log(`Removed post type ${slug} from ${url}. Its posts are kept, hidden until it's pushed again.`)
    return {removed: true, slug, status: 'success'}
  }
}
