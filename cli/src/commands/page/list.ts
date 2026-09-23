import {LoopressCommand} from '../../lib/base.js'
import {PAGES_ENDPOINT, type RemotePage} from '../../utils/page-format.js'
import {pluralize} from '../../utils/pluralize.js'

export default class List extends LoopressCommand {
  static description = 'List the static pages managed by Loopress on WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps page list']

  async run(): Promise<Array<Omit<RemotePage, 'html'>>> {
    const pages = await this.wp.get<RemotePage[]>(PAGES_ENDPOINT)
    // The HTML is only needed by `page diff`, it would drown the JSON output here.
    const listed = pages.map(({html: _html, ...page}) => page)

    if (listed.length === 0) {
      this.log('No pages managed by Loopress')
      return listed
    }

    this.log(`Found ${pluralize(listed.length, 'page')}:`)
    this.log('')
    for (const page of listed) this.log(`  ${page.slug}  ${page.status}  ${page.link}`)

    return listed
  }
}
