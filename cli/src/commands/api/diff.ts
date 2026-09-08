import {Args} from '@oclif/core'

import {DiffCommand, type DiffJson} from '../../lib/diff-command.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'

export default class Diff extends DiffCommand {
  static args = {
    path: Args.string({description: 'Path to api directory (overrides project config)'}),
  }

  static description = 'Show what differs in custom API route files between your local files and a WordPress environment, or between two environments'
  static enableJsonFlag = true
  static examples = ['$ lps api diff', '$ lps api diff --env staging', '$ lps api diff --env staging --against production']
  static flags = {...DiffCommand.againstFlag}

  async run(): Promise<DiffJson> {
    const {args, flags} = await this.parse(Diff)
    const sides = this.resolveSides(flags.against)
    return this.report([this.providerTarget(getResourceStateProvider('api'), sides, args.path)], sides)
  }
}
