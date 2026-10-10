import {confirm} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {writeFile} from 'node:fs/promises'
import {basename, join} from 'node:path'

import {
  type DeclaredArgs,
  type DeclaredTypeSpec,
  itemEndpoint,
  parseDeclaredArgs,
  type RegisteredItem,
  type RemoteDeclaredType,
} from '../utils/declared-type-format.js'
import {pluralize} from '../utils/pluralize.js'
import {resolveResourceDir} from '../utils/resource-dirs.js'
import {LoopressCommand} from './base.js'
import {basenameKey, findOrphanedFiles} from './find-orphaned-files.js'
import {isInteractive} from './interactive.js'
import {loadFiles} from './load-files.js'
import {type CommandClass} from './php-files-command.js'
import {PushCommand} from './push-command.js'
import {getResourceStateProvider} from './resource-state.js'
import {isApplicative404, isNotFoundError} from './wp-client.js'

// `lps cpt` and `lps taxonomy`: the same push/pull/list/rm over a one-JSON-file-per-item
// directory, built from the resource's DeclaredTypeSpec (same factory approach as
// php-files-command.ts). diff and rollback come from resourceDiffCommand/resourceRollbackCommand.

type LocalItem = {args: DeclaredArgs; slug: string}

type PushResult = {path: string; pushed: string[]; status: 'dry-run' | 'success'}
type PullResult = {path: string; status: 'dry-run' | 'success'}
type RmResult = {removed: boolean; slug: string; status: 'aborted' | 'dry-run' | 'success'}

const SOURCE_LABELS: Record<RegisteredItem['source'], string> = {
  acf: 'ACF',
  cptui: 'CPT UI',
  loopress: 'Loopress',
  other: 'theme or plugin',
  wordpress: 'WordPress',
}

function pathArg(spec: DeclaredTypeSpec) {
  return Args.string({description: `Path to the ${spec.dir} directory (overrides project config)`})
}

export type DeclaredPushCommand = Omit<PushCommand, 'run'> & {run(): Promise<PushResult>}

export function declaredPushCommand(spec: DeclaredTypeSpec, description: string): CommandClass<DeclaredPushCommand> {
  class DeclaredPush extends PushCommand {
    static args = {path: pathArg(spec)}
    static description = description
    static enableJsonFlag = true
    static examples = [`$ lps ${spec.cliName} push`]
    static flags = {...PushCommand.dryRunFlag, ...PushCommand.yesFlag}

    async run(): Promise<PushResult> {
      const {args} = await this.parse(DeclaredPush)
      const path = resolveResourceDir(spec.dirKind, this.localConfig, args.path)
      this.log(`Pushing ${spec.plural} to ${this.siteConfig.url}`)
      this.log(`Path: ${path}`)

      const provider = getResourceStateProvider(spec.cliName)
      const beforeState = await this.captureBeforePushState(provider, path)

      const items = await loadFiles<LocalItem>(path, {
        extension: '.json',
        onSkip: (message) => {
          this.warn(message)
        },
        parse: (raw, filePath) => ({args: parseDeclaredArgs(raw), slug: basename(filePath, '.json')}),
      })

      this.log(`Found ${pluralize(items.length, spec.noun, spec.plural)} to push`)

      const pushed: string[] = []
      await this.runPushTasks(
        items,
        (item) => item.slug,
        async (item, task) => {
          await this.pushItem(item, task)
          pushed.push(item.slug)
        },
      )

      await this.writeAfterPushSnapshot(provider, path, beforeState)

      if (this.failedCount > 0) {
        this.error(`${pluralize(this.failedCount, spec.noun, spec.plural)} failed to push.`)
      }

      if (this.dryRun) return {path, pushed, status: 'dry-run'}

      await this.recordSuccess()
      this.log(`All ${spec.plural} pushed.`)
      return {path, pushed, status: 'success'}
    }

    private async currentRevision(slug: string): Promise<string | undefined> {
      try {
        return (await this.wp.get<RemoteDeclaredType>(itemEndpoint(spec, slug))).revision
      } catch (error) {
        if (isNotFoundError(error)) return undefined
        throw error
      }
    }

    private async pushItem({args, slug}: LocalItem, task?: {output: string}): Promise<void> {
      if (this.dryRun) {
        if (task) task.output = `[dry-run] Would push: ${slug}`
        return
      }

      try {
        // Conditional write (#234), same as `menu push`: WordPress refuses it (412) if the item
        // changed since this read. Slug, reserved names and code arguments are checked there.
        const expectedRevision = await this.currentRevision(slug)
        const body: Record<string, unknown> = {args, slug}
        if (expectedRevision !== undefined) body.expectedRevision = expectedRevision

        await this.wp.post(spec.endpoint, body)
        if (task) task.output = `Pushed: ${slug}`
      } catch (error) {
        this.reportTaskFailure(`Failed to push ${slug}: ${(error as Error).message}`, error, task)
      }
    }
  }

  return DeclaredPush
}

export type DeclaredPullCommand = Omit<LoopressCommand, 'run'> & {run(): Promise<PullResult>}

export function declaredPullCommand(spec: DeclaredTypeSpec, description: string): CommandClass<DeclaredPullCommand> {
  class DeclaredPull extends LoopressCommand {
    static args = {path: pathArg(spec)}
    static description = description
    static enableJsonFlag = true
    static examples = [`$ lps ${spec.cliName} pull`]
    static flags = {...LoopressCommand.dryRunFlag, ...LoopressCommand.yesFlag}

    async run(): Promise<PullResult> {
      const {args} = await this.parse(DeclaredPull)
      const path = resolveResourceDir(spec.dirKind, this.localConfig, args.path)

      this.log(`Pulling ${spec.plural} from ${this.siteConfig.url}`)
      this.log(`Path: ${path}`)

      const remote = await this.wp.get<RemoteDeclaredType[]>(spec.endpoint)
      const orphans = await findOrphanedFiles(path, new Set(remote.map(({slug}) => slug)), {extensions: ['.json'], key: basenameKey})

      await this.pullDirectory(path, remote, orphans, {
        dryRunMessage: `Would pull ${pluralize(remote.length, spec.noun, spec.plural)} to ${path}`,
        orphanReason: `in ${path} no longer present on WordPress`,
        pulledMessage: `Pulled ${pluralize(remote.length, spec.noun, spec.plural)} to ${path}`,
        title: ({slug}) => slug,
        // Only the arguments: the slug is the file name, the revision is push bookkeeping.
        async write(item, dir) {
          await writeFile(join(dir, `${item.slug}.json`), JSON.stringify(item.args, null, 2) + '\n')
        },
      })

      return {path, status: this.dryRun ? 'dry-run' : 'success'}
    }
  }

  return DeclaredPull
}

export type DeclaredListCommand = Omit<LoopressCommand, 'run'> & {run(): Promise<RegisteredItem[]>}

// `countLabel` renders the item's count: "3 published" for a post type, "3 terms" for a taxonomy.
export function declaredListCommand(
  spec: DeclaredTypeSpec,
  description: string,
  countLabel: (count: number) => string,
): CommandClass<DeclaredListCommand> {
  class DeclaredList extends LoopressCommand {
    static description = description
    static enableJsonFlag = true
    static examples = [`$ lps ${spec.cliName} list`]

    async run(): Promise<RegisteredItem[]> {
      const items = await this.wp.get<RegisteredItem[]>(spec.registeredEndpoint)

      for (const item of items) {
        const attached = item.objectTypes && item.objectTypes.length > 0 ? `, on ${item.objectTypes.join(', ')}` : ''
        this.log(`${item.slug} (${item.label}): ${SOURCE_LABELS[item.source]}, ${countLabel(item.count)}${attached}`)
        if (item.conflict) {
          this.warn(`${item.slug}: declared in ${spec.dir}/ but already registered by ${SOURCE_LABELS[item.source]}, the Loopress version is skipped`)
        }
      }

      return items
    }
  }

  return DeclaredList
}

export type DeclaredRmCommand = Omit<LoopressCommand, 'run'> & {run(): Promise<RmResult>}

// The only way a Loopress item leaves WordPress: push never deletes (see Push Deletion Rules in
// the product docs). The local file is left alone, same as `hook rm`. `contentNote` says what
// stays in the database ("Its posts", "Its terms").
export function declaredRmCommand(spec: DeclaredTypeSpec, description: string, contentNote: string): CommandClass<DeclaredRmCommand> {
  class DeclaredRm extends LoopressCommand {
    static aliases = [`${spec.cliName}:remove`]
    static args = {
      slug: Args.string({description: `The ${spec.noun} slug, its ${spec.dir}/ file name without .json`, required: true}),
    }

    static description = description
    static enableJsonFlag = true
    static examples = [`$ lps ${spec.cliName} rm <slug>`, `$ lps ${spec.cliName} remove <slug> --yes`]
    static flags = {...LoopressCommand.dryRunFlag, ...LoopressCommand.yesFlag}

    async run(): Promise<RmResult> {
      const {args} = await this.parse(DeclaredRm)
      const {slug} = args
      const {url} = this.siteConfig

      if (this.dryRun) {
        this.log(`[dry-run] Would remove ${spec.noun} ${slug} from ${url}`)
        return {removed: false, slug, status: 'dry-run'}
      }

      if (!this.yes) {
        if (!isInteractive()) this.error(`Removing ${spec.noun} ${slug} needs confirmation. Re-run with --yes.`)

        const ok = await confirm({default: false, message: `Remove ${spec.noun} ${slug} from ${url}? ${contentNote} stay in the database, hidden.`})
        if (!ok) {
          this.log('Aborted.')
          return {removed: false, slug, status: 'aborted'}
        }
      }

      try {
        await this.wp.delete(itemEndpoint(spec, slug))
      } catch (error) {
        const notFound = `${spec.noun[0].toUpperCase()}${spec.noun.slice(1)} not found`
        if (isApplicative404(error, notFound)) this.error(`${spec.noun} ${slug} is not managed by Loopress on ${url}.`)
        throw error
      }

      this.log(`Removed ${spec.noun} ${slug} from ${url}. ${contentNote} are kept, hidden until it's pushed again.`)
      return {removed: true, slug, status: 'success'}
    }
  }

  return DeclaredRm
}
