import {Args, Flags} from '@oclif/core'
import {join} from 'node:path'

import {loadFiles} from '../../lib/load-files.js'
import {PushCommand} from '../../lib/push-command.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {ACF_OBJECT_TYPES, acfEndpoint, acfObjectEndpoint, type AcfObjectType, getAcfKey} from '../../utils/acf-format.js'
import {pluralize} from '../../utils/pluralize.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to ACF directory (overrides project config)'}),
  }

  static description = 'Push ACF field groups, post types, taxonomies, and options pages to WordPress'
  static examples = ['$ lps acf push', '$ lps acf push --type field-groups']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
    type: Flags.string({description: 'Limit to specific ACF object types', multiple: true, options: ACF_OBJECT_TYPES}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveAcfPath(args.path)
    const types = (flags.type && flags.type.length > 0 ? flags.type : ACF_OBJECT_TYPES) as AcfObjectType[]

    this.log(`Pushing ACF configuration to ${url}`)
    this.log(`ACF path: ${path}`)

    const provider = getResourceStateProvider('acf')
    const beforeState = await this.captureBeforePushState(provider, path)

    for (const type of types) {
      await this.pushType(type, path)
    }

    await this.writeAfterPushSnapshot(provider, path, beforeState)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'ACF object')} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All ACF objects pushed.')
  }

  private async currentRevision(type: AcfObjectType, key: string): Promise<string | undefined> {
    try {
      const current = await this.wp.get<{revision?: string}>(acfObjectEndpoint(type, key))
      return current.revision
    } catch (error) {
      if (isNotFoundError(error)) return undefined
      throw error
    }
  }

  private async loadObjects(dir: string): Promise<Array<Record<string, unknown>>> {
    return loadFiles<Record<string, unknown>>(dir, {
      extension: '.json',
      onSkip: (message) => { this.warn(message) },
      parse(raw) {
        const parsed = JSON.parse(raw) as unknown
        if (typeof parsed !== 'object' || parsed === null || getAcfKey(parsed as Record<string, unknown>) === null) {
          throw new Error('missing or invalid "key"')
        }

        return parsed as Record<string, unknown>
      },
    })
  }

  // POST alone covers create-or-update (the controller resolves that server-side via the
  // object's `key`), unlike snippet push there's no numeric-id PUT/404 fallback dance, and no
  // rename-on-push step since `key` is permanently stable.
  private async pushObject(type: AcfObjectType, object: Record<string, unknown>, task?: {output: string}): Promise<void> {
    const key = getAcfKey(object) ?? '(unknown)'

    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${key}`

      return
    }

    try {
      // Read the object's current revision right before writing it, and send it back as
      // `expectedRevision`: WordPress refuses the write (412) if something else changed the
      // object in between, instead of this push silently overwriting it (#234). No revision to
      // condition on for an object that doesn't exist remotely yet (a first push, an upsert
      // create): falls back to today's unconditional write, same as before this existed.
      const expectedRevision = await this.currentRevision(type, key)
      const body: Record<string, unknown> = expectedRevision === undefined ? object : {...object, expectedRevision}

      await this.wp.post(acfEndpoint(type), body)
      if (task) task.output = `Pushed: ${key}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${key}: ${(error as Error).message}`, error, task)
    }
  }

  private async pushType(type: AcfObjectType, basePath: string): Promise<void> {
    const dir = join(basePath, type)
    const objects = await this.loadObjects(dir)
    if (objects.length === 0) return

    this.log(`Found ${objects.length} ${type} to push`)

    await this.runPushTasks(
      objects,
      (object) => getAcfKey(object) ?? '(unknown)',
      async (object, task) => this.pushObject(type, object, task),
    )
  }
}
