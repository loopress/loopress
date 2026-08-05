import {LoopressCommand} from '../../lib/base.js'
import {getPageId, getPageTitle, PAGE_ENDPOINT, PAGE_LIST_QUERY} from '../../utils/page-format.js'

export default class List extends LoopressCommand {
  static description = 'List pages from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps page list']

  async run(): Promise<Record<string, unknown>[]> {
    const pages = await this.wp.get<Record<string, unknown>[]>(`${PAGE_ENDPOINT}?${PAGE_LIST_QUERY}`)

    this.log(`Pages (${pages.length}):`)
    if (pages.length === 0) {
      this.log('  (none)')
      return pages
    }

    for (const page of pages) {
      this.log(`  ${getPageId(page) ?? '(no id)'}. ${getPageTitle(page)}`)
    }

    return pages
  }
}
