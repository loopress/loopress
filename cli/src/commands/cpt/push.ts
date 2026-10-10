import {Args} from '@oclif/core'
import {basename} from 'node:path'

import {loadFiles} from '../../lib/load-files.js'
import {PushCommand} from '../../lib/push-command.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {CPT_ENDPOINT, type CptArgs, cptEndpoint, parseCptArgs, type RemoteCpt} from '../../utils/cpt-format.js'
import {pluralize} from '../../utils/pluralize.js'

type LocalCpt = {args: CptArgs; slug: string}

type CptPushResult = {path: string; pushed: string[]; status: 'dry-run' | 'success'}

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to the cpt directory (overrides project config)'}),
  }

  static description =
    'Push local custom post types (cpt/<slug>.json, register_post_type() arguments) to WordPress. ' +
    'Create or update only, never deletes a post type: use `lps cpt rm` for that.'

  static enableJsonFlag = true
  static examples = ['$ lps cpt push']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<CptPushResult> {
    const {args} = await this.parse(Push)
    const path = this.resolveCptPath(args.path)

    this.log(`Pushing custom post types to ${this.siteConfig.url}`)
    this.log(`Post types path: ${path}`)

    const provider = getResourceStateProvider('cpt')
    const beforeState = await this.captureBeforePushState(provider, path)

    const postTypes = await loadFiles<LocalCpt>(path, {
      extension: '.json',
      onSkip: (message) => {
        this.warn(message)
      },
      parse: (raw, filePath) => ({args: parseCptArgs(raw), slug: basename(filePath, '.json')}),
    })

    this.log(`Found ${pluralize(postTypes.length, 'post type')} to push`)

    const pushed: string[] = []
    await this.runPushTasks(
      postTypes,
      (postType) => postType.slug,
      async (postType, task) => {
        await this.pushPostType(postType, task)
        pushed.push(postType.slug)
      },
    )

    await this.writeAfterPushSnapshot(provider, path, beforeState)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'post type')} failed to push.`)
    }

    if (this.dryRun) return {path, pushed, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All custom post types pushed.')
    return {path, pushed, status: 'success'}
  }

  private async currentRevision(slug: string): Promise<string | undefined> {
    try {
      return (await this.wp.get<RemoteCpt>(cptEndpoint(slug))).revision
    } catch (error) {
      if (isNotFoundError(error)) return undefined
      throw error
    }
  }

  private async pushPostType({args, slug}: LocalCpt, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${slug}`
      return
    }

    try {
      // Conditional write (#234), same as `menu push`: WordPress refuses it (412) if the post
      // type changed since this read. Slug, reserved names and code arguments are checked there.
      const expectedRevision = await this.currentRevision(slug)
      const body: Record<string, unknown> = {args, slug}
      if (expectedRevision !== undefined) body.expectedRevision = expectedRevision

      await this.wp.post(CPT_ENDPOINT, body)
      if (task) task.output = `Pushed: ${slug}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${slug}: ${(error as Error).message}`, error, task)
    }
  }
}
