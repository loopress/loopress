import {Flags} from '@oclif/core'
import got from 'got'

import {PluginName, getSnippetPlugin} from '../../utils/snippet-plugin.js'
import {LoopressCommand} from '../base.js'

export default class List extends LoopressCommand {
  static description = 'List snippets from WordPress'
  static examples = [
    '$ lps snippets list',
    '$ lps snippets list --url http://example.com',
    '$ lps snippets list --plugin wpcode',
  ]
  static flags = {
    ...LoopressCommand.baseFlags,
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
    plugin: Flags.string({
      char: 'p',
      default: 'code-snippets',
      description: 'WordPress snippet plugin to target',
      options: ['code-snippets', 'wpcode'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)
    const {json, plugin} = flags as {json: boolean; plugin: PluginName}
    const {url} = this.siteConfig

    try {
      const adapter = getSnippetPlugin(plugin)
      const endpoint = adapter.endpoint(url)
      const headers = await this.buildAuthHeaders()

      const remoteList: Record<string, unknown>[] = await got.get(endpoint, {headers}).json()
      const snippets = remoteList.map((r) => adapter.fromRemote(r))

      if (json) {
        this.log(JSON.stringify(snippets, null, 2))
      } else {
        if (snippets.length === 0) {
          this.log('No snippets found')
          return
        }

        this.log(`Found ${snippets.length} snippet${snippets.length === 1 ? '' : 's'}:`)
        console.log('')

        for (const snippet of snippets) {
          this.log(`  ${snippet.id}. ${snippet.name}`)
          this.log(`     Active: ${snippet.active ? '✓' : '✗'}`)
          if (snippet.tags && snippet.tags.length > 0) {
            this.log(`     Tags: ${snippet.tags.join(', ')}`)
          }

          if (snippet.description) {
            this.log(`     Description: ${snippet.description}`)
          }

          console.log('')
        }
      }
    } catch (error) {
      this.error(`❌ Error listing snippets: ${(error as Error).message}`)
    }
  }
}
