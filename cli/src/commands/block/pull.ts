import {confirm} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {rm} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {isInteractive} from '../../lib/interactive.js'
import {BLOCKS_ENDPOINT, readLocalBlocks, type RemoteBlock, writeBlock} from '../../utils/block-format.js'
import {pluralize} from '../../utils/pluralize.js'
import {resolveResourceDir} from '../../utils/resource-dirs.js'

type PullResult = {
  orphans: string[]
  pulled: string[]
  status: 'dry-run' | 'success'
}

export default class Pull extends LoopressCommand {
  static override args = {
    path: Args.string({description: 'Path to blocks directory (overrides project config)'}),
  }

  static override description = 'Pull the dynamic blocks Loopress registers on WordPress into blocks/<slug>/ folders'
  static override enableJsonFlag = true
  static override examples = ['$ lps block pull']
  static override flags = {...LoopressCommand.dryRunFlag, ...LoopressCommand.yesFlag}

  async run(): Promise<PullResult> {
    const {args} = await this.parse(Pull)
    const path = resolveResourceDir('block', this.localConfig, args.path)

    this.log(`Pulling dynamic blocks from ${this.siteConfig.url}`)
    this.log(`Blocks path: ${path}`)

    const remote = await this.wp.get<RemoteBlock[]>(BLOCKS_ENDPOINT)
    const remoteSlugs = new Set(remote.map((block) => block.slug))
    const orphans = (await readLocalBlocks(path)).blocks.map((block) => block.slug).filter((slug) => !remoteSlugs.has(slug))
    const pulled = remote.map((block) => block.slug)

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${pluralize(remote.length, 'block')} to ${path}`)
      if (orphans.length > 0) this.log(`[dry-run] Would remove ${pluralize(orphans.length, 'local block')} no longer on WordPress: ${orphans.join(', ')}`)
      return {orphans, pulled, status: 'dry-run'}
    }

    for (const block of remote) {
      // Replaced as a whole, like on the site: a file dropped there is dropped here too.
      await rm(join(path, block.slug), {force: true, recursive: true})
      await writeBlock(path, {files: block.files, slug: block.slug})
    }

    await this.removeOrphanBlocks(path, orphans)
    this.log(`Pulled ${pluralize(remote.length, 'block')} to ${path}`)
    return {orphans, pulled, status: 'success'}
  }

  // Same confirmation rules as removeOrphanedFiles, for folders.
  private async removeOrphanBlocks(path: string, orphans: string[]): Promise<void> {
    if (orphans.length === 0) return

    const description = `${pluralize(orphans.length, 'local block')} no longer on WordPress: ${orphans.join(', ')}`
    if (!this.yes && isInteractive() && !(await confirm({default: true, message: `Remove ${description}?`}))) {
      this.log(`Kept ${description}`)
      return
    }

    for (const slug of orphans) await rm(join(path, slug), {force: true, recursive: true})
    if (this.yes || isInteractive()) this.log(`Removed ${description}`)
    else this.warn(`Removed ${description}`)
  }
}
