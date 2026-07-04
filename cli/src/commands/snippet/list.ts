import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {normalizeSnippet, SNIPPETS_ENDPOINT} from '../../utils/snippet-format.js'

export default class List extends LoopressCommand {
  static description = 'List snippets from WordPress'
  static examples = ['$ lps snippet list']
  static flags = {
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)

    const remoteList = await this.wp.get<Record<string, unknown>[]>(SNIPPETS_ENDPOINT)
    const snippets = remoteList.map((r) => normalizeSnippet(r))

    if (flags.json) {
      this.log(JSON.stringify(snippets, null, 2))
      return
    }

    if (snippets.length === 0) {
      this.log('No snippets found')
      return
    }

    this.log(`Found ${snippets.length} snippet${snippets.length === 1 ? '' : 's'}:`)
    this.log('')

    for (const snippet of snippets) {
      this.log(`  ${snippet.id}. ${snippet.name}`)
      this.log(`     Active: ${snippet.active ? 'yes' : 'no'}`)
      if (snippet.tags.length > 0) {
        this.log(`     Tags: ${snippet.tags.join(', ')}`)
      }

      if (snippet.description) {
        this.log(`     Description: ${snippet.description}`)
      }

      this.log('')
    }
  }
}
