import {Args} from '@oclif/core'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {basenameKey, findOrphanedFiles} from '../../lib/find-orphaned-files.js'
import {CPT_ENDPOINT, type RemoteCpt} from '../../utils/cpt-format.js'

type CptPullResult = {path: string; status: 'dry-run' | 'success'}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to the cpt directory (overrides project config)'}),
  }

  static description =
    'Pull the custom post types Loopress manages on WordPress into cpt/<slug>.json files. ' +
    'Post types registered by a theme or another plugin are never pulled, see `lps cpt list`.'

  static enableJsonFlag = true
  static examples = ['$ lps cpt pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<CptPullResult> {
    const {args} = await this.parse(Pull)
    const path = this.resolveCptPath(args.path)

    this.log(`Pulling custom post types from ${this.siteConfig.url}`)
    this.log(`Post types path: ${path}`)

    const remote = await this.wp.get<RemoteCpt[]>(CPT_ENDPOINT)
    const orphans = await findOrphanedFiles(path, new Set(remote.map(({slug}) => slug)), {extensions: ['.json'], key: basenameKey})

    await this.pullDirectory(path, remote, orphans, {
      dryRunMessage: `Would pull ${remote.length} post type(s) to ${path}`,
      orphanReason: `in ${path} no longer present on WordPress`,
      pulledMessage: `Pulled ${remote.length} post type(s) to ${path}`,
      title: ({slug}) => slug,
      // Only the arguments: the slug is the file name, the revision is push bookkeeping.
      async write(postType, dir) {
        await writeFile(join(dir, `${postType.slug}.json`), JSON.stringify(postType.args, null, 2) + '\n')
      },
    })

    return {path, status: this.dryRun ? 'dry-run' : 'success'}
  }
}
