import {Args} from '@oclif/core'
import {relative, sep} from 'node:path'

import {loadFiles as loadDirectoryFiles} from '../../lib/load-files.js'
import {PushCommand} from '../../lib/push-command.js'
import {pluralize} from '../../utils/pluralize.js'

type HookFile = {
  content: string
  filename: string
}

// Mirrors the server's own allowlist (wordpress-plugin HookFilesController::isValidFilename()):
// filename is sent as a body param (not a URL path segment), same reasoning as api push's own
// pattern, only without the bracketed dynamic-segment alternative: a hook slug is never a URL
// path, so there's nothing for a segment like '[order_id]' to mean here.
const FILENAME_PATTERN = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/

// Mirrors the server's own check (wordpress-plugin FileWriter::DECLARE_PATTERN / withGuard()):
// the server rejects both an absent declare(strict_types=1); and one that appears more than
// once (it needs a single unambiguous insertion point for the ABSPATH guard). Matching that
// "exactly once" rule here too, not just presence, so a file that would still fail server-side
// doesn't falsely pass this earlier check.
const DECLARE_PATTERN = /declare\s*\(\s*strict_types\s*=\s*1\s*\)\s*;/g

type PushResult = {
  pushed: string[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to hooks directory (overrides project config)'}),
  }

  static description = 'Push hook files (actions, filters, cron) to WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps hook push', '$ lps hook push --path ./hooks']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveHooksPath(args.path)

    this.log(`Pushing hooks to ${url}`)
    this.log(`Hooks path: ${path}`)

    const files = await this.loadFiles(path)
    this.log(`Found ${pluralize(files.length, 'hook file')} to push`)

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
      this.error(`${pluralize(this.failedCount, 'hook file')} failed to push.`)
    }

    if (this.dryRun) return {pushed, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All hooks pushed.')
    return {pushed, status: 'success'}
  }

  private async loadFiles(path: string): Promise<HookFile[]> {
    return loadDirectoryFiles<HookFile>(path, {
      extension: '.php',
      onSkip: (message) => { this.warn(message) },
      // relative()'s separator is OS-specific ('\\' on Windows); the server only ever expects
      // '/', same as any URL or import path.
      parse: (raw, filePath) => ({
        content: raw,
        filename: relative(path, filePath).slice(0, -'.php'.length).split(sep).join('/'),
      }),
      recursive: true,
    })
  }

  private async pushFile(file: HookFile, task?: {output: string}): Promise<void> {
    if (!FILENAME_PATTERN.test(file.filename)) {
      const message = `Invalid filename "${file.filename}": each path segment must be lowercase letters, digits, and hyphens (e.g. "content-filters.php" or "content/filters.php")`
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
      const result = await this.wp.put<{syntax_check?: 'skipped'}>('loopress/v1/hook-files', {
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
