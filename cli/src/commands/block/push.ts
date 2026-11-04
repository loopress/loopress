import {Args} from '@oclif/core'
import {isDeepStrictEqual} from 'node:util'

import {errorMessage} from '../../lib/narrow.js'
import {type PushChange, PushCommand} from '../../lib/push-command.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {blockFilesToPush, BLOCKS_ENDPOINT, excludedBlockFiles, formatBlockProblems, readLocalBlocks, type RemoteBlock} from '../../utils/block-format.js'
import {pluralize} from '../../utils/pluralize.js'
import {resolveResourceDir} from '../../utils/resource-dirs.js'

type PushResult = {
  changes?: PushChange[]
  pushed: string[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static override args = {
    path: Args.string({description: 'Path to blocks directory (overrides project config)'}),
  }

  static override description =
    'Push local dynamic blocks (blocks/<slug>/ holding block.json, render.php, and optionally style.css and view.js) to WordPress, ' +
    'registered as loopress/<slug> and placed with <!-- wp:loopress/<slug> /-->. Each block is replaced as a whole. Create or update only, never deletes a block (use `lps block rm`).'

  static override enableJsonFlag = true
  static override examples = ['$ lps block push', '$ lps block push --dry-run']
  static override flags = {...PushCommand.dryRunFlag, ...PushCommand.yesFlag}

  async run(): Promise<PushResult> {
    const {args} = await this.parse(Push)
    const path = resolveResourceDir('block', this.localConfig, args.path)

    this.log(`Pushing dynamic blocks to ${this.siteConfig.url}`)
    this.log(`Blocks path: ${path}`)

    const read = await readLocalBlocks(path)
    if (read.problems.length > 0) this.error(formatBlockProblems(read.problems))
    // An excluded file inside a block folder: the site's copy is sent back, read here rather than
    // from the best-effort snapshot so a failed read stops the push instead of deleting it.
    const withExcluded = read.blocks.some((block) => excludedBlockFiles(path, block.slug).length > 0)
    const site = withExcluded && !this.dryRun ? new Map((await this.wp.get<RemoteBlock[]>(BLOCKS_ENDPOINT)).map((block) => [block.slug, block.files])) : undefined
    const blocks = site ? read.blocks.map((block) => ({...block, files: blockFilesToPush(path, block, site.get(block.slug))})) : read.blocks
    this.log(`Found ${pluralize(blocks.length, 'block')} to push`)

    const provider = getResourceStateProvider('block')
    const beforeState = await this.captureBeforePushState(provider, path)
    if (this.dryRun) return {changes: this.previewChanges, pushed: blocks.map((block) => block.slug), status: 'dry-run'}

    // Unchanged blocks are skipped: each one is a write of its whole folder.
    const changed = blocks.filter((block) => !isDeepStrictEqual(beforeState?.get(block.slug), block.files))
    await this.runPushTasks(
      changed,
      (block) => `loopress/${block.slug}`,
      async (block, task) => {
        try {
          await this.wp.put(BLOCKS_ENDPOINT, {files: block.files, slug: block.slug})
        } catch (error) {
          this.reportTaskFailure(`${block.slug}: ${errorMessage(error)}`, error, task)
        }
      },
    )

    if (this.failedCount > 0) this.error(`${pluralize(this.failedCount, 'block')} failed to push.`)

    await this.writeAfterPushSnapshot(provider, path, beforeState)
    await this.recordSuccess()
    this.log(changed.length === 0 ? 'All blocks already up to date.' : 'All blocks pushed.')
    return {pushed: changed.map((block) => block.slug), status: 'success'}
  }
}
