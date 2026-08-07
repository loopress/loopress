import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {relative, sep} from 'node:path'

import {authManager} from '../../config/auth.manager.js'
import {ApiClient} from '../../lib/api-client.js'
import {loadFiles as loadDirectoryFiles} from '../../lib/load-files.js'
import {PushCommand} from '../../lib/push-command.js'

interface ApiFile {
  content: string
  filename: string
}

// Mirrors the server's own allowlist (wordpress-plugin ApiFilesController::isValidFilename()):
// filename is sent as a body param (not a URL path segment: a nested path can contain '/' and
// '[]', and depending on a server to handle a percent-encoded slash in a URL path correctly is
// exactly the kind of hosting-environment variance Loopress can't assume away), but validating
// client-side first still turns a malformed name into an accurate error and skips a network
// round-trip that could only ever fail.
const FILENAME_PATTERN = /^(?:[a-z0-9-]+|\[\w+\])(?:\/(?:[a-z0-9-]+|\[\w+\]))*$/

// Mirrors the server's own check (wordpress-plugin FileWriter::DECLARE_PATTERN /
// withGuard()): the server rejects both an absent declare(strict_types=1); and one that
// appears more than once (it needs a single unambiguous insertion point for the ABSPATH
// guard). Matching that "exactly once" rule here too, not just presence, so a file that
// would still fail server-side doesn't falsely pass this earlier check.
const DECLARE_PATTERN = /declare\s*\(\s*strict_types\s*=\s*1\s*\)\s*;/g

interface PushResult {
  pushed: string[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to api directory (overrides project config)'}),
  }
  static description = 'Push custom API route files to WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps api push', '$ lps api push --path ./api']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveApiPath(args.path)

    this.log(`Pushing API routes to ${url}`)
    this.log(`API path: ${path}`)

    const files = await this.loadFiles(path)
    this.log(`Found ${files.length} route file${files.length === 1 ? '' : 's'} to push`)

    const pushed: string[] = []

    await new Listr(
      files.map((file) => ({
        task: async (_ctx, task) => {
          await this.pushFile(file, task)
          pushed.push(file.filename)
        },
        title: `Push ${file.filename}`,
      })),
      {concurrent: false, exitOnError: false, renderer: this.jsonEnabled() ? 'silent' : 'default'},
    ).run()

    if (this.failedCount > 0) {
      this.error(`${this.failedCount} route file${this.failedCount === 1 ? '' : 's'} failed to push.`)
    }

    if (this.dryRun) return {pushed, status: 'dry-run'}

    await this.recordSuccess()
    await this.syncApiRoutes(files.map((file) => file.filename))
    this.log('All API routes pushed.')
    return {pushed, status: 'success'}
  }

  private async loadFiles(path: string): Promise<ApiFile[]> {
    return loadDirectoryFiles<ApiFile>(path, {
      extension: '.php',
      onSkip: (message) => this.warn(message),
      // relative()'s separator is OS-specific ('\\' on Windows); the server only ever expects
      // '/', same as any URL or import path.
      parse: (raw, filePath) => ({
        content: raw,
        filename: relative(path, filePath).slice(0, -'.php'.length).split(sep).join('/'),
      }),
      recursive: true,
    })
  }

  private async pushFile(file: ApiFile, task?: {output: string}): Promise<void> {
    if (!FILENAME_PATTERN.test(file.filename)) {
      const message = `Invalid filename "${file.filename}": each path segment must be lowercase letters, digits, and hyphens, or a bracketed dynamic segment like "[order_id]" (e.g. "invoice-pdf/[order_id].php")`
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
      const result = await this.wp.put<{syntax_check?: 'skipped'}>('loopress/v1/api-files', {
        content: file.content,
        filename: file.filename,
      })
      if (task) {
        task.output =
          result.syntax_check === 'skipped'
            ? `Pushed: ${file.filename} (syntax check skipped, exec() unavailable on this host)`
            : `Pushed: ${file.filename}`
      }
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${file.filename}: ${(error as Error).message}`, error, task)
    }
  }

  // Best-effort report of the current file list to the Loopress cloud, purely for console
  // visibility (see obsidian/Product/API and Console Backlog.md, US-18): the routes are already
  // live on WordPress by this point, this can never block or fail the push itself, same
  // reasoning as `recordDeployment` in PushCommand.
  private async syncApiRoutes(filenames: string[]): Promise<void> {
    const token = process.env.LOOPRESS_TOKEN ?? authManager.getAuth()?.token
    const environmentId = this.siteConfig.apiEnvironmentId
    if (!token || !environmentId) return

    try {
      await new ApiClient(token).put('api-routes', {environmentId, filenames})
    } catch {
      // non-blocking: reporting the route list must never interrupt the push flow
    }
  }
}
