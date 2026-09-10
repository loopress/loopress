import {confirm} from '@inquirer/prompts'
import {Args, type Config, Flags} from '@oclif/core'
import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join, relative, sep} from 'node:path'

import {authManager} from '../config/auth.manager.js'
import {type EnvironmentConfig} from '../types/config.js'
import {pluralize} from '../utils/pluralize.js'
import {resolveResourceDir, RESOURCE_DIR_DEFAULTS, type ResourceDirKind} from '../utils/resource-dirs.js'
import {ApiClient} from './api-client.js'
import {LoopressCommand} from './base.js'
import {basenameKey, findOrphanedFiles} from './find-orphaned-files.js'
import {isInteractive} from './interactive.js'
import {loadFiles as loadDirectoryFiles} from './load-files.js'
import {PushCommand} from './push-command.js'
import {isApplicative404} from './wp-client.js'

// api/ and hooks/ are the same thing from the CLI's point of view: a recursive directory of
// PHP files, one file per server-side unit (a REST route, a hook binding), pushed/pulled/
// listed verbatim. `lps <name> push`/`pull`/`list` differ only in wording and which endpoint
// they hit, so the whole body of each lives here as a factory, same shape as
// `resourceDiffCommand` in diff-command.ts.
export type PhpFilesResource = {
  // api push also best-effort reports the route list to the Loopress cloud (US-18); hooks has
  // no such step. Runs after the site is already updated, must never throw.
  afterPush?: (context: {filenames: string[]; siteConfig: EnvironmentConfig}) => Promise<void>
  // 'api' | 'hook': the `lps <cliName> …` verb, used to build the examples.
  cliName: string
  dirKind: ResourceDirKind
  // Exact wording of `lps <name> list`'s "nothing found" line ("No API route files found").
  emptyListMessage: string
  endpoint: string
  // Client-side mirror of the server's own allowlist; a malformed name becomes an accurate
  // error without a round-trip that could only fail.
  filenamePattern: RegExp
  // The part after `Invalid filename "<name>": ` explaining the allowed shape.
  invalidFilenameHint: string
  // 'API routes' | 'hooks': "Pushing <label> to", "Pulling <label> from", "All <label> pushed."
  label: string
  listDescription: string
  // Plural head noun for counts: 'route file' -> "3 route files".
  noun: string
  // Passed to removeOrphanedFiles: "<n> local file(s) <orphanReason>: …".
  orphanReason: string
  // 'API' | 'Hooks': "<pathLabel> path: <dir>".
  pathLabel: string
  // 'api directory' | 'hooks directory': the `[PATH]` arg description reads "Path to <pathNoun>".
  pathNoun: string
  pullDescription: string
  pushDescription: string
  rmDescription: string
}

type PhpFile = {
  content: string
  filename: string
}

// What the server returns from a list/pull: `content` is absent when the server declined to
// read the file back (e.g. it is over the size limit, LP-SEC-02), in which case `error` says why.
type RemotePhpFile = {
  content?: string
  error?: string
  filename: string
}

type PushResult = {
  pruned: string[]
  pushed: string[]
  status: 'dry-run' | 'success'
}

type PullResult = {
  orphans: string[]
  pulled: string[]
  status: 'dry-run' | 'success'
}

type RmResult = {
  filename: string
  removed: boolean
  status: 'aborted' | 'dry-run' | 'success'
}

// Each factory hands back a concrete, `new`-able command class. Typing the return as the bare
// abstract base (`typeof PushCommand`) would make `new X(...)` a type error in the command
// tests; leaving it to infer the anonymous class trips TS4094 on the class's protected
// members. A construct signature onto a named instance type (with `run`'s real return) avoids
// both.
export type CommandClass<TInstance> = new (argv: string[], config: Config) => TInstance
export type PushFilesCommand = Omit<PushCommand, 'run'> & {run(): Promise<PushResult>}
export type PullFilesCommand = Omit<LoopressCommand, 'run'> & {run(): Promise<PullResult>}
export type ListFilesCommand = Omit<LoopressCommand, 'run'> & {run(): Promise<RemotePhpFile[]>}
export type RmFilesCommand = Omit<LoopressCommand, 'run'> & {run(): Promise<RmResult>}

// Mirrors wordpress-plugin FileWriter::DECLARE_PATTERN / withGuard(): the server rejects both
// an absent declare(strict_types=1); and one that appears more than once (it needs a single
// unambiguous insertion point for the ABSPATH guard). Matching "exactly once" here, not just
// presence, so a file that would still fail server-side doesn't falsely pass this check.
const DECLARE_PATTERN = /declare\s*\(\s*strict_types\s*=\s*1\s*\)\s*;/g

function pathArg(pathNoun: string) {
  return {path: Args.string({description: `Path to ${pathNoun} (overrides project config)`})}
}

// relative()'s separator is OS-specific ('\\' on Windows); the server only ever expects '/',
// same as any URL or import path.
async function loadPhpFiles(command: LoopressCommand, dir: string): Promise<PhpFile[]> {
  return loadDirectoryFiles<PhpFile>(dir, {
    extension: '.php',
    onSkip(message) { command.warn(message) },
    parse: (raw, filePath) => ({
      content: raw,
      filename: relative(dir, filePath).slice(0, -'.php'.length).split(sep).join('/'),
    }),
    recursive: true,
  })
}

export function resourcePushCommand(spec: PhpFilesResource): CommandClass<PushFilesCommand> {
  class ResourcePush extends PushCommand {
    static args = pathArg(spec.pathNoun)
    static description = spec.pushDescription
    static enableJsonFlag = true
    static examples = [
      `$ lps ${spec.cliName} push`,
      `$ lps ${spec.cliName} push --path ./${RESOURCE_DIR_DEFAULTS[spec.dirKind]}`,
      `$ lps ${spec.cliName} push --prune`,
    ]

    static flags = {
      ...PushCommand.dryRunFlag,
      ...PushCommand.yesFlag,
      prune: Flags.boolean({
        default: false,
        description: `Delete server-side ${spec.noun}s not present locally after pushing`,
      }),
    }

    async run(): Promise<PushResult> {
      const {args, flags} = await this.parse(ResourcePush)
      const {url} = this.siteConfig
      const path = resolveResourceDir(spec.dirKind, this.localConfig, args.path)

      this.log(`Pushing ${spec.label} to ${url}`)
      this.log(`${spec.pathLabel} path: ${path}`)

      const files = await this.loadFiles(path)
      this.log(`Found ${pluralize(files.length, spec.noun)} to push`)

      const pushed: string[] = []
      await this.runPushTasks(
        files,
        (file) => file.filename,
        async (file, task) => {
          await this.pushFile(file, task)
          pushed.push(file.filename)
        },
      )

      if (this.failedCount > 0) {
        this.error(`${pluralize(this.failedCount, spec.noun)} failed to push.`)
      }

      const pruned = flags.prune ? await this.prune(new Set(files.map((file) => file.filename))) : []

      if (this.dryRun) return {pruned, pushed, status: 'dry-run'}

      await this.recordSuccess()
      await spec.afterPush?.({filenames: pushed, siteConfig: this.siteConfig})
      this.log(`All ${spec.label} pushed.`)
      return {pruned, pushed, status: 'success'}
    }

    private async loadFiles(path: string): Promise<PhpFile[]> {
      return loadPhpFiles(this, path)
    }

    // Mirror of `pull`'s local orphan cleanup, aimed at the server: any file on WordPress with
    // no local counterpart is deleted. Opt-in (`--prune`) because it removes code from a live
    // site. In a non-TTY without `--yes` it refuses rather than prunes: a stray local path in
    // CI must not silently wipe production routes, and unlike `pull`'s local deletions these
    // are not recoverable from the repo.
    private async prune(localFilenames: Set<string>): Promise<string[]> {
      const remote = await this.wp.get<Array<{filename: string}>>(spec.endpoint)
      const orphans = remote.map((file) => file.filename).filter((name) => !localFilenames.has(name))

      if (orphans.length === 0) return []

      const summary = `${pluralize(orphans.length, spec.noun)} on ${this.siteConfig.url} not present locally: ${orphans.join(', ')}`

      if (this.dryRun) {
        this.log(`[dry-run] Would prune ${summary}`)
        return orphans
      }

      if (!this.yes) {
        if (!isInteractive()) {
          const count = pluralize(orphans.length, `server-side ${spec.noun}`)
          this.error(`--prune would delete ${count} but stdin is not a TTY. Re-run with --yes to confirm, or without --prune.`)
        }

        const ok = await confirm({default: false, message: `Prune ${summary}?`})
        if (!ok) {
          this.log('Kept the server-side files, nothing pruned.')
          return []
        }
      }

      // Sequential, like runPushTasks: keeps the "Pruned: …" lines ordered and the WordPress
      // writes serial.
      const deleted: string[] = []
      for (const filename of orphans) {
        await this.wp.delete(`${spec.endpoint}?filename=${encodeURIComponent(filename)}`)
        this.log(`Pruned: ${filename}`)
        deleted.push(filename)
      }

      return deleted
    }

    private async pushFile(file: PhpFile, task?: {output: string}): Promise<void> {
      if (!spec.filenamePattern.test(file.filename)) {
        const message = `Invalid filename "${file.filename}": ${spec.invalidFilenameHint}`
        this.reportTaskFailure(message, new Error(message), task)
      }

      const declareCount = file.content.match(DECLARE_PATTERN)?.length ?? 0
      if (declareCount !== 1) {
        const reason = declareCount === 0 ? 'is missing' : 'appears more than once'
        const message = `${file.filename}.php: "declare(strict_types=1);" ${reason}, it must appear exactly once as the first statement`
        this.reportTaskFailure(message, new Error(message), task)
      }

      if (this.dryRun) {
        if (task) task.output = `[dry-run] Would push: ${file.filename}`

        return
      }

      try {
        const result = await this.wp.put<{syntax_check?: 'skipped'}>(spec.endpoint, {
          content: file.content,
          filename: file.filename,
        })
        if (task) {
          task.output =
            result.syntax_check === 'skipped'
              ? `Pushed: ${file.filename} (syntax check skipped, unavailable on this host)`
              : `Pushed: ${file.filename}`
        }
      } catch (error) {
        this.reportTaskFailure(`Failed to push ${file.filename}: ${(error as Error).message}`, error, task)
      }
    }
  }

  return ResourcePush
}

export function resourcePullCommand(spec: PhpFilesResource): CommandClass<PullFilesCommand> {
  class ResourcePull extends LoopressCommand {
    static args = pathArg(spec.pathNoun)
    static description = spec.pullDescription
    static enableJsonFlag = true
    static examples = [`$ lps ${spec.cliName} pull`, `$ lps ${spec.cliName} pull --path ./${RESOURCE_DIR_DEFAULTS[spec.dirKind]}`]
    static flags = {...LoopressCommand.dryRunFlag, ...LoopressCommand.yesFlag}

    async run(): Promise<PullResult> {
      const {args} = await this.parse(ResourcePull)
      const {url} = this.siteConfig
      const path = resolveResourceDir(spec.dirKind, this.localConfig, args.path)

      this.log(`Pulling ${spec.label} from ${url}`)
      this.log(`${spec.pathLabel} path: ${path}`)

      const files = await this.wp.get<RemotePhpFile[]>(spec.endpoint)

      // A file the server would not read back (over the size limit, see LP-SEC-02) arrives
      // with no content: report it and leave any local copy untouched rather than overwriting
      // it with nothing.
      const unreadable = files.filter((file) => typeof file.content !== 'string')
      for (const file of unreadable) {
        this.warn(`Skipped ${file.filename}: ${file.error ?? 'the server did not return its content'}`)
      }

      const readable = files.filter((file): file is RemotePhpFile & {content: string} => typeof file.content === 'string')

      // A `<filename>.php` no longer present remotely was deleted on WordPress (push stays
      // additive-only, but pull already cleans up locally, same as `snippet pull`). The
      // unreadable ones still exist remotely, so keep them out of the orphan set.
      const orphans = await findOrphanedFiles(path, new Set(files.map((file) => file.filename)), {
        extensions: ['.php'],
        key: basenameKey,
        recursive: true,
      })

      const pulled = readable.map((file) => file.filename)

      await this.pullDirectory(path, readable, orphans, {
        alwaysCreateDir: true,
        dryRunMessage: `Would pull ${pluralize(readable.length, spec.noun)} to ${path}`,
        orphanReason: spec.orphanReason,
        pulledMessage: `Pulled ${pluralize(readable.length, spec.noun)} to ${path}`,
        title: (file) => file.filename,
        async write(file, writeDir) {
          const filePath = join(writeDir, `${file.filename}.php`)
          // filename can contain '/' (a nested slug, e.g. content/filters or a path-param
          // route invoice-pdf/[order_id]): writeFile() doesn't create parent directories on
          // its own the way mkdir()'s recursive option does above for the top-level path.
          await mkdir(dirname(filePath), {recursive: true})
          await writeFile(filePath, file.content)
        },
      })

      if (this.dryRun) return {orphans, pulled, status: 'dry-run'}

      return {orphans, pulled, status: 'success'}
    }
  }

  return ResourcePull
}

export function resourceListCommand(spec: PhpFilesResource): CommandClass<ListFilesCommand> {
  class ResourceList extends LoopressCommand {
    static description = spec.listDescription
    static enableJsonFlag = true
    static examples = [`$ lps ${spec.cliName} list`]

    async run(): Promise<RemotePhpFile[]> {
      const files = await this.wp.get<RemotePhpFile[]>(spec.endpoint)

      if (files.length === 0) {
        this.log(spec.emptyListMessage)
        return files
      }

      this.log(`Found ${pluralize(files.length, spec.noun)}:`)
      this.log('')

      for (const file of files) {
        this.log(file.error ? `  ${file.filename}  (${file.error})` : `  ${file.filename}`)
      }

      return files
    }
  }

  return ResourceList
}

export function resourceRmCommand(spec: PhpFilesResource): CommandClass<RmFilesCommand> {
  class ResourceRm extends LoopressCommand {
    static args = {
      filename: Args.string({
        description: `The ${spec.noun} to remove, its slug without the .php extension (e.g. "hello" or "invoice-pdf/[order_id]")`,
        required: true,
      }),
    }

    static description = spec.rmDescription
    static enableJsonFlag = true
    static examples = [`$ lps ${spec.cliName} rm hello`, `$ lps ${spec.cliName} rm hello --yes`]
    static flags = {...LoopressCommand.dryRunFlag, ...LoopressCommand.yesFlag}

    async run(): Promise<RmResult> {
      const {args} = await this.parse(ResourceRm)
      const {filename} = args
      const {url} = this.siteConfig

      if (!spec.filenamePattern.test(filename)) {
        this.error(`Invalid filename "${filename}": ${spec.invalidFilenameHint}`)
      }

      if (this.dryRun) {
        this.log(`[dry-run] Would remove ${filename} from ${url}`)
        return {filename, removed: false, status: 'dry-run'}
      }

      if (!this.yes) {
        if (!isInteractive()) {
          this.error(`Removing ${filename} needs confirmation. Re-run with --yes.`)
        }

        const ok = await confirm({default: false, message: `Remove ${filename} from ${url}?`})
        if (!ok) {
          this.log('Aborted.')
          return {filename, removed: false, status: 'aborted'}
        }
      }

      try {
        await this.wp.delete(`${spec.endpoint}?filename=${encodeURIComponent(filename)}`)
      } catch (error) {
        if (isApplicative404(error, 'File not found')) {
          this.error(`${filename} is not on ${url}.`)
        }

        throw error
      }

      this.log(`Removed ${filename} from ${url}`)
      return {filename, removed: true, status: 'success'}
    }
  }

  return ResourceRm
}

export const API_FILES_RESOURCE: PhpFilesResource = {
  // Best-effort report of the current route list to the Loopress cloud, purely for console
  // visibility (US-18): the routes are already live on WordPress by this point, so this can
  // never block or fail the push, same reasoning as `recordDeployment` in PushCommand.
  async afterPush({filenames, siteConfig}) {
    const token = process.env.LOOPRESS_TOKEN ?? authManager.getAuth()?.token
    const {apiEnvironmentId} = siteConfig
    if (!token || !apiEnvironmentId) return

    try {
      await new ApiClient(token).put('api-routes', {environmentId: apiEnvironmentId, filenames})
    } catch {
      // non-blocking: reporting the route list must never interrupt the push flow
    }
  },
  cliName: 'api',
  dirKind: 'api',
  emptyListMessage: 'No API route files found',
  endpoint: 'loopress/v1/api-files',
  // Mirrors ApiFilesController::isValidFilename(): kebab-case segments or a bracketed dynamic
  // segment like [order_id], joined by '/'.
  filenamePattern: /^(?:[a-z0-9-]+|\[[A-Za-z_]\w*\])(?:\/(?:[a-z0-9-]+|\[[A-Za-z_]\w*\]))*$/,
  invalidFilenameHint:
    'each path segment must be lowercase letters, digits, and hyphens, or a bracketed dynamic segment like "[order_id]" (e.g. "invoice-pdf/[order_id].php")',
  label: 'API routes',
  listDescription: 'List custom API route files from WordPress',
  noun: 'route file',
  orphanReason: 'whose route no longer exists on WordPress',
  pathLabel: 'API',
  pathNoun: 'api directory',
  pullDescription: 'Pull custom API route files from WordPress',
  pushDescription: 'Push custom API route files to WordPress',
  rmDescription: 'Remove a custom API route file from WordPress',
}

export const HOOK_FILES_RESOURCE: PhpFilesResource = {
  cliName: 'hook',
  dirKind: 'hooks',
  emptyListMessage: 'No hook files found',
  endpoint: 'loopress/v1/hook-files',
  // Mirrors HookFilesController::isValidFilename(): kebab-case segments joined by '/', no
  // bracketed dynamic-segment alternative (a hook slug is never a URL path).
  filenamePattern: /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/,
  invalidFilenameHint:
    'each path segment must be lowercase letters, digits, and hyphens (e.g. "content-filters.php" or "content/filters.php")',
  label: 'hooks',
  listDescription: 'List hook files (actions, filters, cron) from WordPress',
  noun: 'hook file',
  orphanReason: 'no longer present on WordPress',
  pathLabel: 'Hooks',
  pathNoun: 'hooks directory',
  pullDescription: 'Pull hook files (actions, filters, cron) from WordPress',
  pushDescription: 'Push hook files (actions, filters, cron) to WordPress',
  rmDescription: 'Remove a hook file (action, filter, cron) from WordPress',
}
