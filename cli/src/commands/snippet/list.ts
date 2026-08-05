import {LoopressCommand} from '../../lib/base.js'
import {NormalizedSnippet, normalizeSnippet, SNIPPETS_ENDPOINT} from '../../utils/snippet-format.js'

export default class List extends LoopressCommand {
  static description = 'List snippets from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps snippet list']

  async run(): Promise<NormalizedSnippet[]> {
    const remoteList = await this.wp.get<Record<string, unknown>[]>(SNIPPETS_ENDPOINT)
    const snippets = remoteList.map((r) => normalizeSnippet(r))

    if (snippets.length === 0) {
      this.log('No snippets found')
      return snippets
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

    return snippets
  }
}
