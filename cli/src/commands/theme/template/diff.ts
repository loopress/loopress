import {DiffCommand, type DiffJson} from '../../../lib/diff-command.js'
import {getResourceStateProvider} from '../../../lib/resource-state.js'

export default class Diff extends DiffCommand {
  static description =
    'Show what differs in block templates and parts between your local files and a WordPress environment, or between two environments. Templates and parts edited in the Site Editor show up too.'

  static enableJsonFlag = true
  static examples = ['$ lps theme template diff', '$ lps theme template diff --env staging', '$ lps theme template diff --env staging --against production']
  static flags = {...DiffCommand.againstFlag}

  async run(): Promise<DiffJson> {
    const {flags} = await this.parse(Diff)
    const sides = this.resolveSides(flags.against)
    return this.report(
      ['template', 'part'].map((resource) => this.providerTarget(getResourceStateProvider(resource), sides)),
      sides,
    )
  }
}
