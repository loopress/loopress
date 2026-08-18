import {LoopressCommand} from '../../lib/base.js'
import {FORM_ENDPOINT, getFormId, getFormTitle} from '../../utils/form-format.js'

export default class List extends LoopressCommand {
  static description = 'List forms from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps form list']

  async run(): Promise<Array<Record<string, unknown>>> {
    const forms = await this.wp.get<Array<Record<string, unknown>>>(FORM_ENDPOINT)

    this.log(`Forms (${forms.length}):`)
    if (forms.length === 0) {
      this.log('  (none)')
      return forms
    }

    for (const form of forms) {
      this.log(`  ${getFormId(form) ?? '(no id)'}. ${getFormTitle(form)}`)
    }

    return forms
  }
}
