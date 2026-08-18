import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {ACF_OBJECT_TYPES, acfEndpoint, type AcfObjectType, getAcfKey} from '../../utils/acf-format.js'

export default class List extends LoopressCommand {
  static description = 'List ACF field groups, post types, taxonomies, and options pages from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps acf list', '$ lps acf list --type field-groups']
  static flags = {
    type: Flags.string({description: 'Limit to specific ACF object types', multiple: true, options: ACF_OBJECT_TYPES}),
  }

  async run(): Promise<Record<string, Array<Record<string, unknown>>>> {
    const {flags} = await this.parse(List)
    const types = (flags.type && flags.type.length > 0 ? flags.type : ACF_OBJECT_TYPES) as AcfObjectType[]

    const byType: Record<string, Array<Record<string, unknown>>> = {}
    for (const type of types) {
      byType[type] = await this.wp.get<Array<Record<string, unknown>>>(acfEndpoint(type))
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
        const title = typeof object.title === 'string' ? object.title : '(untitled)'
        this.log(`  ${getAcfKey(object) ?? '(no key)'}. ${title}`)
      }

      this.log('')
    }

    return byType
  }
}
