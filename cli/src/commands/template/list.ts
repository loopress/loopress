import {LoopressCommand} from '../../lib/base.js'
import {pluralize} from '../../utils/pluralize.js'
import {type Template, TEMPLATES_ENDPOINT} from '../../utils/template-format.js'

export default class List extends LoopressCommand {
  static description = 'List the block templates managed by Loopress in the active theme'
  static enableJsonFlag = true
  static examples = ['$ lps template list']

  async run(): Promise<Array<Omit<Template, 'html'>>> {
    const templates = await this.wp.get<Template[]>(TEMPLATES_ENDPOINT)
    // The markup is only needed by `template diff`, it would drown the JSON output here.
    const listed = templates.map(({html: _html, ...template}) => template)

    if (listed.length === 0) {
      this.log('No templates managed by Loopress')
      return listed
    }

    this.log(`Found ${pluralize(listed.length, 'template')}:`)
    this.log('')
    for (const template of listed) this.log(`  ${template.slug}  ${template.title}`)

    return listed
  }
}
