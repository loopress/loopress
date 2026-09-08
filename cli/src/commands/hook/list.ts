import {LoopressCommand} from '../../lib/base.js'
import {pluralize} from '../../utils/pluralize.js'

type HookFile = {
  content: string
  filename: string
}

export default class List extends LoopressCommand {
  static description = 'List hook files (actions, filters, cron) from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps hook list']

  async run(): Promise<HookFile[]> {
    const files = await this.wp.get<HookFile[]>('loopress/v1/hook-files')

    if (files.length === 0) {
      this.log('No hook files found')
      return files
    }

    this.log(`Found ${pluralize(files.length, 'hook file')}:`)
    this.log('')

    for (const file of files) {
      this.log(`  ${file.filename}`)
    }

    return files
  }
}
