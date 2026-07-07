import {Args, Command} from '@oclif/core'
import {join} from 'node:path'
import slugify from 'slugify'

import {authManager} from '../../config/auth.manager.js'
import {configManager} from '../../config/project-config.manager.js'
import {ApiClient} from '../../lib/api-client.js'
import {loadSnippets} from '../../lib/load-snippets.js'
import {Snippet} from '../../types/snippet.js'
import {readLocalConfig} from '../../utils/loopress-config.js'

// Publishes to the Loopress api (not a WordPress site), so this does not extend
// `LoopressCommand`/`PushCommand`: those force an environment to be resolved, but a project
// publishing its snippets for sharing doesn't need one — a pure "library" project (see
// `_docs/SNIPPET_COLLECTIONS.md`) may have zero environments configured at all.
export default class Publish extends Command {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }
  static description =
    'Publish snippets to your Loopress account so they can be deployed to other projects. Does not touch any WordPress site.'
  static examples = ['$ lps snippet publish', '$ lps snippet publish --path ./snippets']

  async run(): Promise<void> {
    const {args} = await this.parse(Publish)

    const token = process.env.LOOPRESS_TOKEN ?? authManager.getAuth()?.token
    if (!token) {
      this.error('Not logged in. Run `lps login` first.')
    }

    const localConfig = await readLocalConfig()
    const projectId = localConfig.projectId ?? configManager.getCurrentProject()?.id
    if (!projectId) {
      this.error('No project configured. Run `lps project config` first.')
    }

    const project = configManager.getProject(projectId)
    if (!project) {
      this.error(`Project "${projectId}" (from loopress.json) not found. Run \`lps project config\` to configure it.`)
    }

    if (!project.apiProjectId) {
      this.error(`Project "${project.name}" is not linked to your Loopress account yet. Run \`lps project sync\` first.`)
    }

    const path = args.path ?? join(localConfig.rootDir ?? '.', localConfig.snippetsDir ?? 'snippets')

    this.log(`Publishing snippets from ${path}`)

    let snippets: Snippet[]
    try {
      snippets = await loadSnippets(path)
    } catch (error) {
      this.error((error as Error).message)
    }

    const api = new ApiClient(token)
    await api.post(`projects/${project.apiProjectId}/snippets/publish`, {
      snippets: snippets.map((snippet) => this.toPayload(snippet)),
    })

    this.log(`Published ${snippets.length} snippet${snippets.length === 1 ? '' : 's'} to your Loopress account.`)
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
      slug: slugify(snippet.name, {lower: true, strict: true}),
      tags: snippet.tags,
      type: snippet.type,
    }
  }
}
