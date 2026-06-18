import {Args, Flags} from '@oclif/core'
import got from 'got'

import {getSnippetPlugin, PluginName} from '../../utils/snippet-plugin.js'
import {LoopressCommand} from '../../lib/base.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }
  static description = 'Pull snippets from WordPress'
  static examples = [
    '$ lps snippets pull',
    '$ lps snippets pull --url http://example.com',
    '$ lps snippets pull --path ./snippets',
    '$ lps snippets pull --plugin wpcode',
  ]
  static flags = {
    ...LoopressCommand.baseFlags,
    dryRun: Flags.boolean({char: 'd', description: 'Dry run - show what would happen without making changes'}),
    plugin: Flags.string({
      char: 'p',
      default: 'code-snippets',
      description: 'WordPress snippet plugin to target',
      options: ['code-snippets', 'wpcode'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)
    const {dryRun, plugin} = flags as {dryRun: boolean; plugin: PluginName}
    const {url} = this.siteConfig
    const path = await this.resolveSnippetsPath(args.path)

    this.log(`📥 Pulling snippets from ${url} via ${plugin}`)
    this.log(`📂 From snippet path: ${path}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    try {
      const adapter = getSnippetPlugin(plugin)
      const endpoint = adapter.endpoint(url)
      const headers = await this.buildAuthHeaders()

      const remoteList: Record<string, unknown>[] = await got.get(endpoint, {headers}).json()
      const snippets = remoteList.map((r) => adapter.fromRemote(r))

      const fs = await import('node:fs/promises')

      if (dryRun) {
        this.log(`📝 [DRY RUN] Would pull ${snippets.length} snippets`)
        return
      }

      let count = 0
      for (const snippet of snippets) {
        const filePath = `${path}/${snippet.name}.php`
        await fs.writeFile(filePath, snippet.code)
        count++
        this.log(`✅ Pulled: ${snippet.name}`)
      }

      this.log(`🎉 Successfully pulled ${count} snippet${count === 1 ? '' : 's'} to ${path}`)
    } catch (error) {
      this.error(`❌ Error pulling snippets: ${(error as Error).message}`)
    }
  }
}
