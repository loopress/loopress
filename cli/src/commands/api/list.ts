import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'

interface ApiFile {
  content: string
  filename: string
}

export default class List extends LoopressCommand {
  static description = 'List custom API route files from WordPress'
  static examples = ['$ lps api list']
  static flags = {
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)

    const files = await this.wp.get<ApiFile[]>('loopress/v1/api-files')

    if (flags.json) {
      this.log(JSON.stringify(files, null, 2))
      return
    }

    if (files.length === 0) {
      this.log('No API route files found')
      return
    }

    this.log(`Found ${files.length} route file${files.length === 1 ? '' : 's'}:`)
    this.log('')

    for (const file of files) {
      this.log(`  ${file.filename}`)
    }
  }
}
