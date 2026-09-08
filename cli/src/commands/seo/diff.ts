import {Args} from '@oclif/core'

import {DiffCommand, type DiffJson} from '../../lib/diff-command.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'

export default class Diff extends DiffCommand {
  static args = {
    path: Args.string({description: 'Path to SEO directory (overrides project config)'}),
  }

  static description =
    'Show what differs in SEO settings, post meta, and redirects between your local files and a WordPress environment, or between two environments'

  static enableJsonFlag = true
  static examples = ['$ lps seo diff', '$ lps seo diff --env staging', '$ lps seo diff --env staging --against production']
  static flags = {...DiffCommand.againstFlag}

  async run(): Promise<DiffJson> {
    const {args, flags} = await this.parse(Diff)
    const sides = this.resolveSides(flags.against)
    return this.report([this.providerTarget(getResourceStateProvider('seo'), sides, args.path)], sides)
  }
}
