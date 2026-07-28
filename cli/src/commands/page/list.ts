import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {getPageId, getPageTitle, PAGE_ENDPOINT, PAGE_LIST_QUERY} from '../../utils/page-format.js'

export default class List extends LoopressCommand {
  static description = 'List pages from WordPress'
  static examples = ['$ lps page list']
  static flags = {
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)
    const pages = await this.wp.get<Record<string, unknown>[]>(`${PAGE_ENDPOINT}?${PAGE_LIST_QUERY}`)

    if (flags.json) {
      this.log(JSON.stringify(pages, null, 2))
      return
    }

    this.log(`Pages (${pages.length}):`)
    if (pages.length === 0) {
      this.log('  (none)')
      return
    }

    for (const page of pages) {
      this.log(`  ${getPageId(page) ?? '(no id)'}. ${getPageTitle(page)}`)
    }
  }
}
