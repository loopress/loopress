import {confirm} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {join, relative} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {isInteractive} from '../../lib/interactive.js'
import {readdirTolerant} from '../../lib/readdir-tolerant.js'
import {isApplicative404} from '../../lib/wp-client.js'
import {BLOCK_SLUG, BLOCKS_ENDPOINT} from '../../utils/block-format.js'
import {resolveResourceDir} from '../../utils/resource-dirs.js'

type RmResult = {
  references: string[]
  removed: boolean
  slug: string
  status: 'aborted' | 'dry-run' | 'success'
}

export default class Rm extends LoopressCommand {
  static override aliases = ['block:remove']
  static override args = {
    slug: Args.string({description: 'The block to remove, its blocks/ folder name (e.g. "hero")', required: true}),
  }

  static override description =
    'Remove a dynamic block from WordPress. A <!-- wp:loopress/<slug> /--> left in a page or template renders nothing until it is pushed again. Local files are left untouched.'

  static override enableJsonFlag = true
  static override examples = ['$ lps block rm hero', '$ lps block rm hero --yes']
  static override flags = {...LoopressCommand.dryRunFlag, ...LoopressCommand.yesFlag}

  async run(): Promise<RmResult> {
    const {args} = await this.parse(Rm)
    const {slug} = args
    const {url} = this.siteConfig

    if (!BLOCK_SLUG.test(slug)) this.error(`Invalid block slug "${slug}": lowercase letters, digits and hyphens, starting with a letter.`)

    const references = await this.localReferences(slug)
    if (references.length > 0) {
      this.warn(`loopress/${slug} is still used in ${references.join(', ')}: it will render nothing there.`)
    }

    if (this.dryRun) {
      this.log(`[dry-run] Would remove loopress/${slug} from ${url}`)
      return {references, removed: false, slug, status: 'dry-run'}
    }

    if (!this.yes) {
      if (!isInteractive()) this.error(`Removing loopress/${slug} needs confirmation. Re-run with --yes.`)
      if (!(await confirm({default: false, message: `Remove loopress/${slug} from ${url}?`}))) {
        this.log('Aborted.')
        return {references, removed: false, slug, status: 'aborted'}
      }
    }

    try {
      await this.wp.delete(`${BLOCKS_ENDPOINT}?slug=${encodeURIComponent(slug)}`)
    } catch (error) {
      if (isApplicative404(error, `Unknown block "${slug}"`)) this.error(`loopress/${slug} is not on ${url}.`)
      throw error
    }

    this.log(`Removed loopress/${slug} from ${url}`)
    return {references, removed: true, slug, status: 'success'}
  }

  // The project's own files still placing the block: pages, templates, parts and patterns.
  private async localReferences(slug: string): Promise<string[]> {
    const marker = new RegExp(String.raw`<!--\s*wp:loopress/${slug}[\s/]`)
    const found: string[] = []
    for (const kind of ['page', 'template', 'part', 'pattern'] as const) {
      const dir = resolveResourceDir(kind, this.localConfig)
      for (const entry of await readdirTolerant(dir, {recursive: true, withFileTypes: true})) {
        if (!entry.isFile() || !entry.name.endsWith('.html')) continue
        const file = join(entry.parentPath, entry.name)
        if (marker.test(await readFile(file, 'utf8'))) found.push(relative(process.cwd(), file))
      }
    }

    return found
  }
}
