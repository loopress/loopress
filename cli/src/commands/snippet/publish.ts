import {Args, Command} from '@oclif/core'
import {join} from 'node:path'

import {ApiClient} from '../../lib/api-client.js'
import {loadSnippets} from '../../lib/load-snippets.js'
import {resolveLinkedProject} from '../../lib/resolve-linked-project.js'
import {type Snippet} from '../../types/snippet.js'
import {pluralize} from '../../utils/pluralize.js'
import {toSlug} from '../../utils/to-slug.js'

// Publishes to the Loopress api (not a WordPress site), so this does not extend
// `LoopressCommand`/`PushCommand`: those force an environment to be resolved, but a project
// publishing its snippets for sharing doesn't need one, a pure "library" project 
// may have zero environments configured at all.
export default class Publish extends Command {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }

  static description =
    'Publish snippets to your Loopress account so they can be deployed to other projects. Does not touch any WordPress site.'

  static examples = ['$ lps snippet publish', '$ lps snippet publish --path ./snippets']

  async run(): Promise<void> {
    const {args} = await this.parse(Publish)

    const {apiProjectId, localConfig, token} = await resolveLinkedProject((message) => this.error(message))

    const path = args.path ?? join(localConfig.rootDir ?? '.', localConfig.snippetsDir ?? 'snippets')

    this.log(`Publishing snippets from ${path}`)

    let snippets: Snippet[]
    try {
      snippets = await loadSnippets(path)
    } catch (error) {
      this.error((error as Error).message)
    }

    const api = new ApiClient(token)
    try {
      await api.post(`projects/${apiProjectId}/snippets/publish`, {
        snippets: snippets.map((snippet) => this.toPayload(snippet)),
      })
    } catch (error) {
      this.error((error as Error).message)
    }

    this.log(`Published ${pluralize(snippets.length, 'snippet')} to your Loopress account.`)
  }

  private toPayload(snippet: Snippet): Record<string, unknown> {
    return {
      active: snippet.active,
      code: snippet.code,
      insertMethod: snippet.insertMethod,
      location: snippet.location,
      name: snippet.name,
      priority: snippet.priority,
      shortcodeAttributes: snippet.shortcodeAttributes,
      // Derived from the snippet's name rather than its on-disk filename: the same
      // slugification `push`/`pull` already use for the canonical `<id>-<slug>` filename
      // convention, so it stays stable even for a not-yet-pushed file with an arbitrary name.
      slug: toSlug(snippet.name),
      tags: snippet.tags,
      type: snippet.type,
    }
  }
}
