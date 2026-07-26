import {Args, Flags} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {basenameKey, findOrphanedFiles} from '../../lib/find-orphaned-files.js'
import {ACF_OBJECT_TYPES, acfEndpoint, AcfObjectType, getAcfKey} from '../../utils/acf-format.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to ACF directory (overrides project config)'}),
  }
  static description = 'Pull ACF field groups, post types, taxonomies, and options pages from WordPress'
  static examples = ['$ lps acf pull', '$ lps acf pull --type field-groups']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
    type: Flags.string({description: 'Limit to specific ACF object types', multiple: true, options: ACF_OBJECT_TYPES}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveAcfPath(args.path)
    const types = (flags.type && flags.type.length > 0 ? flags.type : ACF_OBJECT_TYPES) as AcfObjectType[]

    this.log(`Pulling ACF configuration from ${url}`)
    this.log(`ACF path: ${path}`)

    for (const type of types) {
      await this.pullType(type, path)
    }
  }

  private async pullType(type: AcfObjectType, basePath: string): Promise<void> {
    const dir = join(basePath, type)
    const remoteList = await this.wp.get<Record<string, unknown>[]>(acfEndpoint(type))
    const withKey = remoteList.filter((object) => getAcfKey(object) !== null)
    const skipped = remoteList.length - withKey.length

    // Every file in a type's subdirectory is unambiguously `<key>.json`: `key` is the stable
    // identity ACF itself already uses (see its own Local JSON mechanism), no numeric-id/slug
    // filename convention like snippets.
    const orphans = await findOrphanedFiles(dir, new Set(withKey.map((object) => getAcfKey(object) as string)), {
      extensions: ['.json'],
      key: basenameKey,
    })

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${withKey.length} ${type} to ${dir}`)
      if (orphans.length > 0) {
        this.log(
          `[dry-run] Would remove ${orphans.length} local file${orphans.length === 1 ? '' : 's'} in ${dir} no longer present on WordPress: ${orphans.join(', ')}`,
        )
      }

      return
    }

    if (withKey.length > 0) await mkdir(dir, {recursive: true})

    await new Listr(
      withKey.map((object) => {
        const key = getAcfKey(object) as string
        return {
          async task(_ctx, task) {
            await writeFile(join(dir, `${key}.json`), JSON.stringify(object, null, 2) + '\n')
            task.output = `Pulled: ${key}`
          },
          title: `Pull ${key}`,
        }
      }),
    ).run()

    await this.removeOrphanedFiles(dir, orphans, `in ${dir} no longer present on WordPress`)

    this.log(`Pulled ${withKey.length} ${type} to ${dir}`)
    if (skipped > 0) {
      this.warn(`${skipped} ${type} skipped because they have no key`)
    }
  }
}
