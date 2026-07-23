import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {getWpFormsId, getWpFormsTitle, WPFORMS_ENDPOINT} from '../../utils/wpforms-format.js'

export default class List extends LoopressCommand {
  static description = 'List WPForms forms from WordPress'
  static examples = ['$ lps form list']
  static flags = {
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)
    const forms = await this.wp.get<Record<string, unknown>[]>(WPFORMS_ENDPOINT)

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
      this.log(`  ${getWpFormsId(form) ?? '(no id)'}. ${getWpFormsTitle(form)}`)
    }
  }
}
