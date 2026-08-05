import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {basename} from 'node:path'

import {authManager} from '../../config/auth.manager.js'
import {ApiClient} from '../../lib/api-client.js'
import {loadFiles as loadDirectoryFiles} from '../../lib/load-files.js'
import {PushCommand} from '../../lib/push-command.js'

interface ApiFile {
  content: string
  filename: string
}

// Mirrors the server's own allowlist (wordpress-plugin ApiFilesController::FILENAME_PATTERN):
// the filename becomes a URL path segment matched against this exact regex by the WP REST
// route itself. A filename that doesn't match never reaches the controller, WordPress's
// router returns a generic 404 before validate_callback runs, which the CLI's shared error
// formatter reports as "is the plugin installed?", a confusing message for what is actually
// an invalid filename. Checking client-side first turns that into an accurate error and
// skips a network round-trip that could only ever fail.
const FILENAME_PATTERN = /^[a-z0-9-]+$/

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
      parse: (raw, filePath) => ({content: raw, filename: basename(filePath, '.php')}),
    })
  }

  private async pushFile(file: ApiFile, task?: {output: string}): Promise<void> {
    if (!FILENAME_PATTERN.test(file.filename)) {
      const message = `Invalid filename "${file.filename}": only lowercase letters, digits, and hyphens are allowed (e.g. "hello-world.php")`
      this.reportTaskFailure(message, new Error(message), task)
    }

    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${file.filename}`

      return
    }

    try {
      await this.wp.put(`loopress/v1/api-files/${file.filename}`, {content: file.content})
      if (task) task.output = `Pushed: ${file.filename}`
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
