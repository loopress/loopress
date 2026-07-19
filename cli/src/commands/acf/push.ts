import {Args, Flags} from '@oclif/core'
import {Listr} from 'listr2'
import {readdir, readFile} from 'node:fs/promises'
import {extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {ACF_OBJECT_TYPES, acfEndpoint, AcfObjectType, getAcfKey} from '../../utils/acf-format.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to ACF directory (overrides project config)'}),
  }
  static description = 'Push ACF field groups, post types, taxonomies, and options pages to WordPress'
  static examples = ['$ lps acf push', '$ lps acf push --type field-groups']
  static flags = {
    ...PushCommand.dryRunFlag,
    type: Flags.string({description: 'Limit to specific ACF object types', multiple: true, options: ACF_OBJECT_TYPES}),
  }
  private failedCount = 0

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveAcfPath(args.path)
    const types = (flags.type && flags.type.length > 0 ? flags.type : ACF_OBJECT_TYPES) as AcfObjectType[]

    this.log(`Pushing ACF configuration to ${url}`)
    this.log(`ACF path: ${path}`)

    for (const type of types) {
      await this.pushType(type, path)
    }

    if (this.failedCount > 0) {
      this.error(`${this.failedCount} ACF object${this.failedCount === 1 ? '' : 's'} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All ACF objects pushed.')
  }

  // One object's file is read in isolation: a corrupted or hand-broken JSON file (or one
  // missing/emptying its "key") must only skip that object, not abort loading the rest of
  // the type's directory — same principle as loadSnippets() for the snippet feature.
  private async loadObjects(dir: string): Promise<Record<string, unknown>[]> {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    const objects: Record<string, unknown>[] = []
    for (const file of files) {
      if (extname(file) !== '.json') continue

      const filePath = join(dir, file)
      let parsed: unknown
      try {
        parsed = JSON.parse(await readFile(filePath, 'utf8'))
      } catch (error) {
        this.warn(`Skipping "${filePath}": ${(error as Error).message}`)
        continue
      }

      if (typeof parsed !== 'object' || parsed === null || getAcfKey(parsed as Record<string, unknown>) === null) {
        this.warn(`Skipping "${filePath}": missing or invalid "key"`)
        continue
      }

      objects.push(parsed as Record<string, unknown>)
    }

    return objects
  }

  // Throwing on failure (rather than returning a boolean) is what lets Listr mark the task as
  // failed (red cross) instead of completed; `exitOnError: false` on the task list still lets
  // sibling objects push regardless. POST alone covers create-or-update (the controller resolves
  // that server-side via the object's `key`), unlike snippet push there's no numeric-id PUT/404
  // fallback dance, and no rename-on-push step since `key` is permanently stable.
  private async pushObject(type: AcfObjectType, object: Record<string, unknown>, task?: {output: string}): Promise<void> {
    const key = getAcfKey(object) ?? '(unknown)'

    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${key}`

      return
    }

    try {
      await this.wp.post(acfEndpoint(type), object)
      if (task) task.output = `Pushed: ${key}`
    } catch (error) {
      const message = `Failed to push ${key}: ${(error as Error).message}`
      if (task) task.output = message
      else this.warn(`  ${message}`)

      this.failedCount++
      throw error
    }
  }

  private async pushType(type: AcfObjectType, basePath: string): Promise<void> {
    const dir = join(basePath, type)
    const objects = await this.loadObjects(dir)
    if (objects.length === 0) return

    this.log(`Found ${objects.length} ${type} to push`)

    await new Listr(
      objects.map((object) => ({
        task: async (_ctx, task) => this.pushObject(type, object, task),
        title: `Push ${getAcfKey(object) ?? '(unknown)'}`,
      })),
      {concurrent: false, exitOnError: false},
    ).run()
  }
}
