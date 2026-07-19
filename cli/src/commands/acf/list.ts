import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {ACF_OBJECT_TYPES, acfEndpoint, AcfObjectType, getAcfKey} from '../../utils/acf-format.js'

export default class List extends LoopressCommand {
  static description = 'List ACF field groups, post types, taxonomies, and options pages from WordPress'
  static examples = ['$ lps acf list', '$ lps acf list --type field-groups']
  static flags = {
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
    type: Flags.string({description: 'Limit to specific ACF object types', multiple: true, options: ACF_OBJECT_TYPES}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)
    const types = (flags.type && flags.type.length > 0 ? flags.type : ACF_OBJECT_TYPES) as AcfObjectType[]

    const byType: Record<string, Record<string, unknown>[]> = {}
    for (const type of types) {
      byType[type] = await this.wp.get<Record<string, unknown>[]>(acfEndpoint(type))
    }

    if (flags.json) {
      this.log(JSON.stringify(byType, null, 2))
      return
    }

    for (const type of types) {
      const objects = byType[type]
      this.log(`${type} (${objects.length}):`)

      if (objects.length === 0) {
        this.log('  (none)')
        this.log('')
        continue
      }

      for (const object of objects) {
        this.log(`  ${getAcfKey(object) ?? '(no key)'}. ${String(object.title ?? '(untitled)')}`)
      }

      this.log('')
    }
  }
}
