import {LoopressCommand} from '../../lib/base.js'
import {pluralize} from '../../utils/pluralize.js'

type ApiFile = {
  content: string
  filename: string
}

export default class List extends LoopressCommand {
  static description = 'List custom API route files from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps api list']

  async run(): Promise<ApiFile[]> {
    const files = await this.wp.get<ApiFile[]>('loopress/v1/api-files')

    if (files.length === 0) {
      this.log('No API route files found')
      return files
    }

    this.log(`Found ${pluralize(files.length, 'route file')}:`)
    this.log('')

    for (const file of files) {
      this.log(`  ${file.filename}`)
    }

    return files
  }
}
