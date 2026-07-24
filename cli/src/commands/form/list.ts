import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {FORM_ENDPOINT, getFormId, getFormTitle} from '../../utils/form-format.js'

export default class List extends LoopressCommand {
  static description = 'List forms from WordPress'
  static examples = ['$ lps form list']
  static flags = {
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)
    const forms = await this.wp.get<Record<string, unknown>[]>(FORM_ENDPOINT)

    if (flags.json) {
      this.log(JSON.stringify(forms, null, 2))
      return
    }

    this.log(`Forms (${forms.length}):`)
    if (forms.length === 0) {
      this.log('  (none)')
      return
    }

    for (const form of forms) {
      this.log(`  ${getFormId(form) ?? '(no id)'}. ${getFormTitle(form)}`)
    }
  }
}
