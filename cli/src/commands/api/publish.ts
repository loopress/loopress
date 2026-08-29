import {Args, Command} from '@oclif/core'
import {basename, join} from 'node:path'

import {ApiClient} from '../../lib/api-client.js'
import {loadFiles} from '../../lib/load-files.js'
import {resolveLinkedProject} from '../../lib/resolve-linked-project.js'
import {pluralize} from '../../utils/pluralize.js'

type ApiRouteFile = {
  code: string
  filename: string
}

// Publishes to the Loopress api (not a WordPress site), so this does not extend
// `LoopressCommand`/`PushCommand`: those force an environment to be resolved, but publishing
// for cross-project sharing doesn't need one, same reasoning as `snippet publish`. An API route
// is a special case of the same publish/deploy rules as snippets and ACF (see
// obsidian/Product/API and Console Backlog.md, US-18): a `push` (direct to WordPress, this
// project's own site) and a `publish` (to the cloud, deployable to other projects) are two
// separate, coexisting paths.
export default class Publish extends Command {
  static args = {
    path: Args.string({description: 'Path to api directory (overrides project config)'}),
  }

  static description =
    'Publish custom API routes to your Loopress account so they can be deployed to other projects. Does not touch any WordPress site.'

  static examples = ['$ lps api publish', '$ lps api publish --path ./api']

  async run(): Promise<void> {
    const {args} = await this.parse(Publish)

    const {apiProjectId, localConfig, token} = await resolveLinkedProject((message) => this.error(message))

    const path = args.path ?? join(localConfig.rootDir ?? '.', localConfig.apiDir ?? 'api')

    this.log(`Publishing API routes from ${path}`)

    const files = await loadFiles<ApiRouteFile>(path, {
      extension: '.php',
      onSkip: (message) => { this.warn(message) },
      parse: (raw, filePath) => ({code: raw, filename: basename(filePath, '.php')}),
    })

    const api = new ApiClient(token)
    try {
      await api.post(`projects/${apiProjectId}/api-routes/publish/upsert`, {
        routes: files,
      })
      await api.post(`projects/${apiProjectId}/api-routes/publish/prune`, {
        filenames: files.map((file) => file.filename),
      })
    } catch (error) {
      this.error((error as Error).message)
    }

    this.log(`Published ${pluralize(files.length, 'route')} to your Loopress account.`)
  }
}
