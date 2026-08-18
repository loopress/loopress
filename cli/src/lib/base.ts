import {confirm} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, rm} from 'node:fs/promises'
import {join} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {type EnvironmentConfig} from '../types/config.js'
import {type LoopressLocalConfig, readLocalConfig} from '../utils/loopress-config.js'
import {pluralize} from '../utils/pluralize.js'
import {isInteractive} from './interactive.js'
import {isAppPasswordStale, rotateAppPassword} from './rotate-app-password.js'
import {WpClient} from './wp-client.js'

type ParsedBaseFlags = {
  'dry-run'?: boolean
  env?: string
  yes?: boolean
}

export abstract class LoopressCommand extends Command {
  // On every subclass without opt-in: targeting an environment explicitly beats depending on
  // the machine-wide mutable state of `lps project switch`, which is shared across terminals.
  static baseFlags = {
    env: Flags.string({
      description: 'Target environment by name, overriding the globally active one (lps project switch)',
    }),
  }

  static dryRunFlag = {
    'dry-run': Flags.boolean({char: 'd', description: 'Show what would change without making changes'}),
  }

  static yesFlag = {
    yes: Flags.boolean({char: 'y', description: 'Answer yes to confirmation prompts'}),
  }

  protected dryRun = false
  protected localConfig: LoopressLocalConfig = {}
  protected projectId!: string
  protected siteConfig!: EnvironmentConfig
  protected yes = false
  private wpClient?: WpClient

  protected get rootDir(): string {
    return this.localConfig.rootDir ?? '.'
  }

  protected get wp(): WpClient {
    if (!this.wpClient) {
      const {token, url} = this.siteConfig
      if (!token) {
        this.error(`No credentials configured for ${url}. Run \`lps project config\` to add them.`)
      }

      this.wpClient = new WpClient(url, token)
    }

    return this.wpClient
  }

  async init(): Promise<void> {
    await super.init()

    const {flags} = (await this.parse({
      args: this.ctor.args,
      baseFlags: (this.ctor as typeof LoopressCommand).baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      flags: this.ctor.flags,
      strict: this.ctor.strict,
    })) as unknown as {flags: ParsedBaseFlags}

    this.dryRun = Boolean(flags['dry-run'])
    this.yes = Boolean(flags.yes)
    this.localConfig = await readLocalConfig()

    const resolved = this.resolveEnvironment(flags.env)
    this.siteConfig = resolved.env
    this.projectId = resolved.projectId

    await this.maybeAutoRotate()
  }

  // Silent, best-effort: a stale app password still works, so a failed rotation attempt
  // (offline, site down) just tries again on the next command instead of blocking this one.
  // `dryRun` is excluded since rotating writes a new credential, a real side effect a
  // --dry-run run promises not to cause. `Rotate` overrides this to a no-op: its own `run()`
  // already rotates unconditionally, so the background check would only redo the same work.
  protected async maybeAutoRotate(): Promise<void> {
    if (this.dryRun) return

    const {token} = this.siteConfig
    if (!token || !isAppPasswordStale(this.siteConfig.addedAt)) return

    try {
      const rotated = await rotateAppPassword({...this.siteConfig, token})
      this.siteConfig = rotated
      configManager.setEnvironment(this.projectId, rotated.name, rotated)
    } catch {
      // swallowed: see comment above
    }
  }

  // Shared shape of every resource's directory pull: write each item, then reconcile local
  // files against the remote list (see removeOrphanedFiles above). `dryRunMessage` and
  // `pulledMessage` are fully-formed by the caller (label pluralization varies per resource,
  // e.g. ACF's `type` is a fixed category name, never pluralized), the "[dry-run] Would "
  // prefix and the orphans notice are the only wording this method owns.
  protected async pullDirectory<T>(
    dir: string,
    items: T[],
    orphans: string[],
    options: {
      // Defaults to false (create only when there's something to write, acf/form/page's
      // behavior); snippet pull sets this to true, its directory is created unconditionally
      // even with nothing to pull.
      alwaysCreateDir?: boolean
      dryRunMessage: string
      orphanReason: string
      pulledMessage: string
      title: (item: T) => string
      write: (item: T, dir: string) => Promise<void>
    },
  ): Promise<void> {
    if (this.dryRun) {
      this.log(`[dry-run] ${options.dryRunMessage}`)
      if (orphans.length > 0) {
        this.log(`[dry-run] Would remove ${pluralize(orphans.length, 'local file')} ${options.orphanReason}: ${orphans.join(', ')}`)
      }

      return
    }

    if (options.alwaysCreateDir === true || items.length > 0) await mkdir(dir, {recursive: true})

    await new Listr(
      items.map((item) => ({
        async task(_ctx, task) {
          await options.write(item, dir)
          task.output = `Pulled: ${options.title(item)}`
        },
        title: `Pull ${options.title(item)}`,
      })),
      {renderer: this.jsonEnabled() ? 'silent' : 'default'},
    ).run()

    await this.removeOrphanedFiles(dir, orphans, options.orphanReason)

    this.log(options.pulledMessage)
  }

  // Orphan cleanup shared by every pull command (see Push Deletion Rules in the product docs):
  // in a TTY the list is shown and confirmed first (Enter accepts), --yes skips the prompt, and
  // outside a TTY the files are removed with a warning, the behavior scripts relied on before
  // the confirmation existed.
  protected async removeOrphanedFiles(dir: string, orphans: string[], reason: string): Promise<void> {
    if (orphans.length === 0) return

    const description = `${pluralize(orphans.length, 'local file')} ${reason}: ${orphans.join(', ')}`

    if (!this.yes && isInteractive()) {
      const isProceed = await confirm({default: true, message: `Remove ${description}?`})
      if (!isProceed) {
        this.log(`Kept ${description}`)
        return
      }
    }

    for (const file of orphans) await rm(join(dir, file), {force: true})

    // Non-interactive removals (no TTY, CI) keep the original warn so existing
    // scripts that parse stderr or check exit status are not broken. Confirmed
    // interactive removals are intentional, so log() is appropriate.
    if (this.yes || isInteractive()) {
      this.log(`Removed ${description}`)
    } else {
      this.warn(`Removed ${description}`)
    }
  }

  protected resolveAcfPath(override?: string): string {
    if (override) return override
    return join(this.rootDir, this.localConfig.acfDir ?? 'acf')
  }

  protected resolveApiPath(override?: string): string {
    if (override) return override
    return join(this.rootDir, this.localConfig.apiDir ?? 'api')
  }

  protected resolveFormPath(override?: string): string {
    if (override) return override
    return join(this.rootDir, this.localConfig.formDir ?? 'forms')
  }

  protected resolvePagePath(override?: string): string {
    if (override) return override
    return join(this.rootDir, this.localConfig.pageDir ?? 'pages')
  }

  protected resolveSeoPath(override?: string): string {
    if (override) return override
    return join(this.rootDir, this.localConfig.seoDir ?? 'seo')
  }

  protected resolveSnippetsPath(override?: string): string {
    if (override) return override
    return join(this.rootDir, this.localConfig.snippetsDir ?? 'snippets')
  }

  private pickEnvironment(project: {environments: Record<string, EnvironmentConfig>; name: string}, envName: string): EnvironmentConfig {
    const env = project.environments[envName]
    if (!env) {
      this.error(
        `Environment "${envName}" not found in project "${project.name}". Available: ${Object.keys(project.environments).join(', ')}`,
      )
    }

    return env
  }

  private resolveEnvironment(envName?: string): {env: EnvironmentConfig; projectId: string} {
    if (this.localConfig.projectId) {
      return this.resolveEnvironmentForConfiguredProject(this.localConfig.projectId, envName)
    }

    if (envName) {
      const current = configManager.getCurrentProject()
      if (!current) {
        this.error('No project configured. Run `lps project config` first.')
      }

      return {env: this.pickEnvironment(current, envName), projectId: current.id}
    }

    const env = configManager.getCurrentEnv()
    const current = configManager.getCurrentProject()
    if (env && current) return {env, projectId: current.id}

    this.error('No environment configured. Run `lps project config` first.')
  }

  private resolveEnvironmentForConfiguredProject(projectId: string, envName?: string): {env: EnvironmentConfig; projectId: string} {
    const project = configManager.getProject(projectId)
    if (!project) {
      this.error(`Project "${projectId}" (from loopress.json) not found. Run \`lps project config\` to configure it.`)
    }

    const envNames = Object.keys(project.environments)
    if (envNames.length === 0) {
      this.error(`Project "${project.name}" has no environments configured. Run \`lps project config\` to add one.`)
    }

    if (envName) return {env: this.pickEnvironment(project, envName), projectId}

    if (envNames.length === 1) {
      return {env: project.environments[envNames[0]], projectId}
    }

    const current = configManager.getCurrentProject()
    const currentEnv = current?.id === projectId ? configManager.getCurrentEnv() : null
    if (!currentEnv) {
      this.error(`Project "${project.name}" has multiple environments. Run \`lps project switch\` to pick one.`)
    }

    return {env: currentEnv, projectId}
  }
}
