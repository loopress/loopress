import {LoopressCommand} from '../../../lib/base.js'
import {pluralize} from '../../../utils/pluralize.js'
import {CHILD_THEME_ENDPOINT, type ChildTheme} from '../../../utils/template-format.js'

type ListResult = Omit<ChildTheme, 'parts' | 'templates'> & {parts: string[]; templates: string[]}

export default class List extends LoopressCommand {
  static description = 'Show the Loopress child theme of the active block theme: its templates, parts, and those edited in the Site Editor'
  static enableJsonFlag = true
  static examples = ['$ lps theme template list']

  async run(): Promise<ListResult> {
    const child = await this.wp.get<ChildTheme>(CHILD_THEME_ENDPOINT)
    // The markup is only needed by `template diff`, it would drown the JSON output here.
    const result = {...child, parts: child.parts.map((part) => part.slug), templates: child.templates.map((template) => template.slug)}

    if (!child.exists) {
      this.log(`No Loopress child theme yet (${child.stylesheet}), run lps theme template push.`)
      return result
    }

    this.log(`${child.stylesheet} (child of ${child.parent}, ${child.active ? 'active' : 'not active'})`)
    this.log(`  ${pluralize(result.templates.length, 'template')}: ${result.templates.join(', ') || 'none'}`)
    this.log(`  ${pluralize(result.parts.length, 'part')}: ${result.parts.join(', ') || 'none'}`)
    if (child.customized.length > 0) this.log(`  Edited in the Site Editor: ${child.customized.join(', ')}`)

    return result
  }
}
