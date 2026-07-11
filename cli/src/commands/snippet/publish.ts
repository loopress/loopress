import {Args, Command} from '@oclif/core'
import {chunk} from 'lodash'
import {join} from 'node:path'
import slugify from 'slugify'

import {authManager} from '../../config/auth.manager.js'
import {configManager} from '../../config/project-config.manager.js'
import {ApiClient} from '../../lib/api-client.js'
import {loadSnippets} from '../../lib/load-snippets.js'
import {Snippet} from '../../types/snippet.js'
import {readLocalConfig} from '../../utils/loopress-config.js'

// Keeps each upload request small enough to stay under the api's JSON body size limit, so
// publishing a large collection doesn't fail with "Request entity too large" the way sending
// every snippet in one request used to.
const BATCH_SIZE = 20

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

    const payloads = snippets.map((snippet) => this.toPayload(snippet))
    const batches = chunk(payloads, BATCH_SIZE)

    const api = new ApiClient(token)
    try {
      for (const [index, batch] of batches.entries()) {
        if (batches.length > 1) {
          this.log(`Uploading batch ${index + 1}/${batches.length} (${batch.length} snippets)...`)
        }

        await api.post(`projects/${project.apiProjectId}/snippets/publish/upsert`, {snippets: batch})
      }

      // Sent as a separate, lightweight call (just slugs, no snippet content) so removing
      // snippets no longer present locally doesn't require the full collection to fit in a
      // single request: see `BATCH_SIZE` above for why the upload itself is chunked.
      await api.post(`projects/${project.apiProjectId}/snippets/publish/prune`, {
        slugs: payloads.map((payload) => payload.slug),
      })
    } catch (error) {
      this.error((error as Error).message)
    }

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
