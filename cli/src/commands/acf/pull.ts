import {Args, Flags} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises'
import {extname, join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {ACF_OBJECT_TYPES, acfEndpoint, AcfObjectType, getAcfKey} from '../../utils/acf-format.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to ACF directory (overrides project config)'}),
  }
  static description = 'Pull ACF field groups, post types, taxonomies, and options pages from WordPress'
  static examples = ['$ lps acf pull', '$ lps acf pull --type field-groups']
  static flags = {
    ...LoopressCommand.dryRunFlag,
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

  // Every file in a type's subdirectory is unambiguously `<key>.json` — unlike snippets, ACF
  // objects have no numeric-id/slug filename convention. `key` is the stable identity ACF
  // itself already uses for this (see its own Local JSON mechanism), so orphan detection is a
  // plain set difference, no regex/extension juggling needed.
  private async findOrphanedFiles(dir: string, keepKeys: Set<string>): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    return files.filter((file) => extname(file) === '.json' && !keepKeys.has(file.slice(0, -'.json'.length)))
  }

  private async pullType(type: AcfObjectType, basePath: string): Promise<void> {
    const dir = join(basePath, type)
    const remoteList = await this.wp.get<Record<string, unknown>[]>(acfEndpoint(type))
    const withKey = remoteList.filter((object) => getAcfKey(object) !== null)
    const skipped = remoteList.length - withKey.length

    const orphans = await this.findOrphanedFiles(dir, new Set(withKey.map((object) => getAcfKey(object) as string)))

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

    for (const file of orphans) {
      await rm(join(dir, file), {force: true})
    }

    if (orphans.length > 0) {
      this.warn(
        `Removed ${orphans.length} local file${orphans.length === 1 ? '' : 's'} in ${dir} no longer present on WordPress: ${orphans.join(', ')}`,
      )
    }

    this.log(`Pulled ${withKey.length} ${type} to ${dir}`)
    if (skipped > 0) {
      this.warn(`${skipped} ${type} skipped because they have no key`)
    }
  }
}
