import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {RANKMATH_REDIRECTS_ENDPOINT, RankMathRedirect} from '../../utils/rankmath-format.js'

export default class List extends LoopressCommand {
  static description = 'List RankMath redirects configured on WordPress'
  static examples = ['$ lps rankmath list', '$ lps rankmath list --json']
  static flags = {
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)
    const redirects = await this.wp.get<RankMathRedirect[]>(RANKMATH_REDIRECTS_ENDPOINT)

    if (flags.json) {
      this.log(JSON.stringify(redirects, null, 2))
      return
    }

    this.log(`redirects (${redirects.length}):`)

    if (redirects.length === 0) {
      this.log('  (none)')
      return
    }

    for (const redirect of redirects) {
      this.log(`  ${redirect.id}. [${redirect.status}] ${redirect.headerCode} -> ${redirect.urlTo}`)
    }
  }
}
