import {confirm} from '@inquirer/prompts'
import {Args, Command} from '@oclif/core'
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- stable since 22.3, works unflagged on 22.0+
import {cp, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename, isAbsolute, join, relative, resolve} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {LoopressCommand} from '../lib/base.js'
import {isInteractive} from '../lib/interactive.js'
import {stdoutToStderr} from '../lib/json-delegation.js'
import {type EnvironmentConfig} from '../types/config.js'
import {readLocalConfig} from '../utils/loopress-config.js'
import {resolveResourceDir, RESOURCE_DIR_DEFAULTS, type ResourceDirKind} from '../utils/resource-dirs.js'

type PromoteResult = {from: string; status: 'dry-run' | 'promoted'; to: string}

export default class Promote extends Command {
  static args = {
    from: Args.string({description: 'Environment to copy the configuration from', required: true}),
    to: Args.string({description: 'Environment to copy the configuration to', required: true}),
  }

  static description =
    'Copy every tracked resource from one environment to another by pulling from <from> then pushing to <to>. Local tracked files are overwritten with <from> in the process. With --dry-run, <from> is pulled into a throwaway copy of the project instead, and the push is only previewed.'

  static enableJsonFlag = true
  static examples = ['$ lps promote staging production', '$ lps promote production staging --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<PromoteResult> {
    const {args, flags} = await this.parse(Promote)
    const {yes} = flags
    const dryRun = flags['dry-run']

    const {environments, projectName} = await this.resolveProject()
    const from = this.requireEnvironment(environments, projectName, args.from)
    const to = this.requireEnvironment(environments, projectName, args.to)

    if (from.name === to.name) {
      this.error('<from> and <to> must be different environments.')
    }

    if (!dryRun) await this.confirmPromotion(from.name, to.name, to.url, yes)

    // A dry-run pull writes nothing, so a dry-run push right after would preview the current
    // local files instead of <from>. Instead, really pull into a throwaway copy of the project
    // and dry-run the push from there: the preview is what a real promotion would push, and the
    // user's own files stay untouched.
    const originalCwd = process.cwd()
    const scratch = dryRun ? await this.enterScratchCopy(originalCwd) : undefined
    // The delegated pull is real, so without this its auto-rotation could revoke a stale app
    // password during what the user asked to be a preview (see LoopressCommand.maybeAutoRotate).
    const previousNoRotate = process.env.LOOPRESS_NO_AUTO_ROTATE
    if (scratch) process.env.LOOPRESS_NO_AUTO_ROTATE = '1'
    try {
      this.log(`\n=== Pulling from ${from.name} (${from.url}) ===`)
      try {
        await stdoutToStderr(this.jsonEnabled(), async () => this.config.runCommand('pull', this.delegateArgv(from.name, false)))
      } catch (error) {
        // A partial pull must never be pushed onward: stop before touching <to>.
        this.error(`Pull from ${from.name} failed, ${to.name} left untouched: ${(error as Error).message}`)
      }

      this.log(`\n=== Pushing to ${to.name} (${to.url}) ===`)
      await stdoutToStderr(this.jsonEnabled(), async () => this.config.runCommand('push', this.delegateArgv(to.name, dryRun)))
    } finally {
      if (scratch) {
        if (previousNoRotate === undefined) delete process.env.LOOPRESS_NO_AUTO_ROTATE
        else process.env.LOOPRESS_NO_AUTO_ROTATE = previousNoRotate
        process.chdir(originalCwd)
        await rm(scratch, {force: true, recursive: true})
      }
    }

    this.log(dryRun ? `\n[dry-run] ${from.name} would be promoted to ${to.name}.` : `\n${from.name} promoted to ${to.name}.`)

    return {from: from.name, status: dryRun ? 'dry-run' : 'promoted', to: to.name}
  }

  // The scratch pull writes wherever loopress.json points. An absolute or `../` rootDir or
  // resource dir would land outside the copy, in the user's real files, during a dry run.
  private async assertDirsInsideProject(projectDir: string): Promise<void> {
    const localConfig = await readLocalConfig()
    const dirs = [localConfig.rootDir ?? '.', ...Object.keys(RESOURCE_DIR_DEFAULTS).map((kind) => resolveResourceDir(kind as ResourceDirKind, localConfig))]
    const outside = dirs.find((dir) => {
      const rel = relative(projectDir, resolve(projectDir, dir))
      return rel.startsWith('..') || isAbsolute(rel)
    })
    if (outside !== undefined) {
      this.error(
        `--dry-run can't preview safely: "${outside}" in loopress.json is outside the project. Run \`lps diff --env <from> --against <to>\` instead.`,
      )
    }
  }

  // Deliberately not `guardProductionPush`: promote overwrites local tracked files for every
  // target, not just production, so it needs its own confirmation regardless of the name. That
  // prompt also calls out production when relevant, making a second production-only guard
  // redundant.
  private async confirmPromotion(from: string, to: string, toUrl: string, yes: boolean): Promise<void> {
    if (yes) return

    const isProduction = to.toLowerCase() === 'production'
    const warning = isProduction ? ` "${to}" is a production environment.` : ''

    if (!isInteractive()) {
      this.error(
        `This overwrites local tracked files with ${from} and pushes them to ${to} (${toUrl}).${warning} Pass --yes to confirm.`,
      )
    }

    const isProceed = await confirm({
      default: !isProduction,
      message: `Promote ${from} to ${to} (${toUrl})? This overwrites local tracked files with ${from}.${warning}`,
    })
    if (!isProceed) this.error('Aborted.')
  }

  // `--yes` is always forwarded: confirmPromotion above already gathered intent once, so the
  // delegated `pull` and `push` must not prompt again (push would otherwise re-run its own
  // production guard, and pull its orphan-deletion prompt).
  private delegateArgv(env: string, dryRun: boolean): string[] {
    const argv = ['--env', env, '--yes']
    if (dryRun) argv.push('--dry-run')
    return argv
  }

  // Copies the whole project (not just what `pull` rewrites): push also reads files pull never
  // touches, and a real promotion pushes those as they are locally. node_modules and .git are
  // never read by push. Returns the scratch root, cwd is left inside the copy.
  private async enterScratchCopy(projectDir: string): Promise<string> {
    await this.assertDirsInsideProject(projectDir)

    const scratch = await mkdtemp(join(tmpdir(), 'lps-promote-'))
    try {
      const copy = join(scratch, basename(projectDir))
      await cp(projectDir, copy, {
        filter: (source) => !['.git', 'node_modules'].includes(basename(source)),
        recursive: true,
      })
      process.chdir(copy)
    } catch (error) {
      await rm(scratch, {force: true, recursive: true})
      throw error
    }

    return scratch
  }

  private requireEnvironment(
    environments: Record<string, EnvironmentConfig>,
    projectName: string,
    name: string,
  ): EnvironmentConfig {
    const env = environments[name]
    if (!env) {
      this.error(`Environment "${name}" not found in project "${projectName}". Available: ${Object.keys(environments).join(', ')}`)
    }

    return env
  }

  // Same project resolution as base.ts / status.ts: the pinned project from loopress.json, or
  // the globally active one.
  private async resolveProject(): Promise<{environments: Record<string, EnvironmentConfig>; projectName: string}> {
    const {projectId} = await readLocalConfig()
    const project = projectId ? configManager.getProject(projectId) : configManager.getCurrentProject()

    if (!project) {
      this.error('No project configured. Run `lps project config` first.')
    }

    if (Object.keys(project.environments).length === 0) {
      this.error(`Project "${project.name}" has no environments configured. Run \`lps project config\` to add one.`)
    }

    return {environments: project.environments, projectName: project.name}
  }
}
