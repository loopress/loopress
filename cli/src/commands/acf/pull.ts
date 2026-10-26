import {Args, Flags} from '@oclif/core'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {basenameKey, findOrphanedFiles} from '../../lib/find-orphaned-files.js'
import {ACF_OBJECT_TYPES, acfEndpoint, type AcfObjectType, getAcfKey} from '../../utils/acf-format.js'

type AcfPullResult = {path: string; status: 'dry-run' | 'success'; types: AcfObjectType[]}

export default class Pull extends LoopressCommand {
  static override aliases = ['scf:pull']
  static override args = {
    path: Args.string({description: 'Path to ACF directory (overrides project config)'}),
  }

  static override description = 'Pull ACF field groups, post types, taxonomies, and options pages from WordPress into local files'
  static override enableJsonFlag = true
  static override examples = ['$ lps acf pull', '$ lps acf pull --type field-groups']
  static override flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
    type: Flags.string({description: 'Limit to specific ACF object types', multiple: true, options: ACF_OBJECT_TYPES}),
  }

  async run(): Promise<AcfPullResult> {
    const {args, flags} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveAcfPath(args.path)
    const types = (flags.type && flags.type.length > 0 ? flags.type : ACF_OBJECT_TYPES) as AcfObjectType[]

    this.log(`Pulling ACF configuration from ${url}`)
    this.log(`ACF path: ${path}`)

    for (const type of types) {
      await this.pullType(type, path)
    }

    return {path, status: this.dryRun ? 'dry-run' : 'success', types}
  }

  private async pullType(type: AcfObjectType, basePath: string): Promise<void> {
    const dir = join(basePath, type)
    const remoteList = await this.wp.get<Array<Record<string, unknown>>>(acfEndpoint(type))
    const withKey = remoteList.flatMap((object) => {
      const key = getAcfKey(object)
      return key === null ? [] : [{key, object}]
    })
    const skipped = remoteList.length - withKey.length

    // Every file in a type's subdirectory is unambiguously `<key>.json`: `key` is the stable
    // identity ACF itself already uses (see its own Local JSON mechanism), no numeric-id/slug
    // filename convention like snippets.
    const orphans = await findOrphanedFiles(dir, new Set(withKey.map(({key}) => key)), {
      extensions: ['.json'],
      key: basenameKey,
    })

    await this.pullDirectory(dir, withKey, orphans, {
      dryRunMessage: `Would pull ${withKey.length} ${type} to ${dir}`,
      orphanReason: `in ${dir} no longer present on WordPress`,
      pulledMessage: `Pulled ${withKey.length} ${type} to ${dir}`,
      title: ({key}) => key,
      write: async ({key, object}, writeDir) => writeFile(join(writeDir, `${key}.json`), JSON.stringify(object, null, 2) + '\n'),
    })

    if (this.dryRun) return

    if (skipped > 0) {
      this.warn(`${skipped} ${type} skipped because they have no key`)
    }
  }
}
