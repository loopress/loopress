import {confirm} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, rm} from 'node:fs/promises'
import {join} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {type EnvironmentConfig} from '../types/config.js'
import {isEnvironmentType} from '../types/environment-type.js'
import {type LoopressLocalConfig, readLocalConfig} from '../utils/loopress-config.js'
import {pluralize} from '../utils/pluralize.js'
import {resolveResourceDir} from '../utils/resource-dirs.js'
import {commandResourceKind, getCapabilities, missingIntegration, type SiteCapabilities, unsupportedMessage} from './capabilities.js'
import {declaredPlugins} from './declared-plugins.js'
import {activateExclusions} from './exclude.js'
import {isInteractive} from './interactive.js'
import {isAppPasswordStale, rotateAppPassword} from './rotate-app-password.js'
import {withoutSpinner} from './spinner.js'
import {WpClient} from './wp-client.js'

type ParsedBaseFlags = {
  'dry-run'?: boolean
  env?: string
  overwrite?: boolean
  'production-confirmed'?: boolean
  yes?: boolean
}

// Listr's default renderer wraps every label to the terminal width, so a terminal reporting no
// width (columns 0 or undefined, e.g. `script` without a size) renders one letter per line. The
// simple renderer prints plain lines and does not wrap.
export function listrRenderer(silent: boolean): 'default' | 'silent' | 'simple' {
  if (silent) return 'silent'
  return process.stdout.columns > 0 ? 'default' : 'simple'
}

export abstract class LoopressCommand extends Command {
  // On every subclass without opt-in. Without it, commands target the "local" environment, so
  // reaching a remote site is always spelled out in the command itself.
  static override baseFlags = {
    env: Flags.string({
      description: 'Target environment by name (default: "local", or the project\'s only environment)',
    }),
  }

  static dryRunFlag = {
    'dry-run': Flags.boolean({char: 'd', description: 'Show what would change without making changes'}),
  }

  // Whether the environment's `exclude` globs in loopress.json apply (lib/exclude.ts): push and
  // diff commands only, never pull.
  static honorsExclude = false

  // Opt-in on push, pull, diff and promote: a resource the project uses but the site can't hold
  // (see lib/capabilities.ts) is reported skipped, with a final warning, instead of failing the run.
  static skipUnsupportedFlag = {
    'skip-unsupported': Flags.boolean({
      description: "Skip the resources the project uses but this site can't hold (a missing plugin, a Full feature on Light) instead of failing, and warn about each",
    }),
  }

  static yesFlag = {
    yes: Flags.boolean({char: 'y', description: 'Answer yes to confirmation prompts'}),
  }

  protected dryRun = false

  protected localConfig: LoopressLocalConfig = {}
  // Set by PushCommand's --overwrite, see PushCommand.guardOutsideEdits.
  protected overwrite = false
  // Set by PushCommand's hidden --production-confirmed, see there.
  protected productionConfirmed = false
  // Every environment of the project, the target included (see environment-urls.ts).
  protected projectEnvironments: EnvironmentConfig[] = []
  protected projectId!: string
  protected siteConfig!: EnvironmentConfig
  protected yes = false
  private typeChecked = false
  private wpClient?: WpClient

  protected get rootDir(): string {
    return this.localConfig.rootDir ?? '.'
  }

  protected get wp(): WpClient {
    if (!this.wpClient) {
      const {name, token, url} = this.siteConfig
      if (!token) {
        this.error(`No credentials configured for ${url}. Run \`lps project config\` to add them.`)
      }

      this.wpClient = new WpClient(url, token, name)
    }

    return this.wpClient
  }

  // What the targeted site can do, read once per process (see lib/capabilities.ts).
  protected async capabilities(): Promise<SiteCapabilities> {
    const capabilities = await getCapabilities(this.wp, this.siteConfig.name)
    if (!this.typeChecked) {
      this.typeChecked = true
      this.warnOnEnvironmentTypeMismatch(capabilities)
    }

    return capabilities
  }

  override async init(): Promise<void> {
    await super.init()

    // oclif types `this.ctor` as the base `typeof Command`, and parse() can't infer flags from a
    // runtime-chosen subclass: both casts state what every LoopressCommand subclass declares.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
    const {flags} = (await this.parse({
      args: this.ctor.args,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
      baseFlags: (this.ctor as typeof LoopressCommand).baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      flags: this.ctor.flags,
      strict: this.ctor.strict,
    })) as unknown as {flags: ParsedBaseFlags}

    this.dryRun = Boolean(flags['dry-run'])
    this.yes = Boolean(flags.yes)
    this.overwrite = Boolean(flags.overwrite)
    this.productionConfirmed = Boolean(flags['production-confirmed'])
    this.localConfig = await readLocalConfig()

    const resolved = this.resolveEnvironment(flags.env)
    this.siteConfig = resolved.env
    this.projectId = resolved.projectId
    activateExclusions({
      config: this.localConfig,
      cwd: process.cwd(),
      envName: this.siteConfig.name,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
      honors: (this.ctor as typeof LoopressCommand).honorsExclude,
    })

    await this.maybeAutoRotate()
    await this.assertSiteSupportsResource()
  }

  // Rotation revokes the old app password, so a copy stored as a CI secret now gets a 401.
  protected logCiRefreshHint(envName: string): void {
    const escaped = envName.replaceAll("'", String.raw`'\''`)
    const name = `'${escaped}'`
    const capture = `cfg=$(lps project export --env ${name})`
    const message = `The CI copy of the "${envName}" credentials is now revoked. Refresh it: \`${capture} && gh secret set LOOPRESS_CONFIG --body "$cfg"\` (GitLab: \`${capture} && glab variable update LOOPRESS_CONFIG "$cfg" --type file\`).`
    // oclif mutes this.log under --json, and MCP always passes --json: stderr keeps the notice visible.
    if (this.jsonEnabled()) process.stderr.write(`${message}\n`)
    else this.log(message)
  }

  // Silent, best-effort: a stale app password still works, so a failed rotation attempt
  // (offline, site down) just tries again on the next command instead of blocking this one.
  // `dryRun` is excluded since rotating writes a new credential, a real side effect a
  // --dry-run run promises not to cause. `Rotate` overrides this to a no-op: its own `run()`
  // already rotates unconditionally, so the background check would only redo the same work.
  // CI is excluded too: rotating revokes the old password, but a runner's config.json (a CI
  // secret copy) is thrown away at the end of the job, so every later run would get a 401.
  protected async maybeAutoRotate(): Promise<void> {
    if (this.dryRun) return

    const {token} = this.siteConfig
    if (!token || !isAppPasswordStale(this.siteConfig.addedAt)) return

    // Set by `lps promote --dry-run` around its delegated pull: a preview must not revoke anything.
    if (process.env.LOOPRESS_NO_AUTO_ROTATE) return

    if (process.env.CI) {
      this.warn(
        `The app password for "${this.siteConfig.name}" is older than 90 days. Auto-rotation is skipped in CI, run \`lps project rotate\` where this config.json lives, then update the CI secret.`,
      )
      return
    }

    try {
      const rotated = await rotateAppPassword({...this.siteConfig, token})
      this.siteConfig = rotated
      configManager.setEnvironment(this.projectId, rotated.name, rotated)
      this.logCiRefreshHint(rotated.name)
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
      // Defaults to false (create only when there's something to write, acf/form's
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

    await withoutSpinner(async () => {
      await new Listr(
        items.map((item) => ({
          async task(_ctx, task) {
            await options.write(item, dir)
            task.output = `Pulled: ${options.title(item)}`
          },
          title: `Pull ${options.title(item)}`,
        })),
        // Listr types the task wrapper per renderer, a union of renderer names does not fit it.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Listr ties the task wrapper type to one renderer
        {renderer: listrRenderer(this.jsonEnabled()) as 'default'},
      ).run()
    })

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
    return resolveResourceDir('acf', this.localConfig, override)
  }

  protected resolveApiPath(override?: string): string {
    return resolveResourceDir('api', this.localConfig, override)
  }

  protected resolveAppsPath(override?: string): string {
    return resolveResourceDir('apps', this.localConfig, override)
  }

  protected resolveFormPath(override?: string): string {
    return resolveResourceDir('form', this.localConfig, override)
  }

  protected resolveHooksPath(override?: string): string {
    return resolveResourceDir('hooks', this.localConfig, override)
  }

  protected resolveMenuPath(override?: string): string {
    return resolveResourceDir('menu', this.localConfig, override)
  }

  protected resolveOptionsPath(override?: string): string {
    return resolveResourceDir('options', this.localConfig, override)
  }

  protected resolveSnippetsPath(override?: string): string {
    return resolveResourceDir('snippets', this.localConfig, override)
  }

  protected resolveThemeStylesPath(override?: string): string {
    return resolveResourceDir('themeStyles', this.localConfig, override)
  }

  // A command on a single kind of resource (`lps hook push`) says what `lps push` says when the
  // site can't hold it, instead of failing on the 404. A site whose capabilities can't be read
  // (too old a plugin, unreachable) lets the command run and report its own error.
  private async assertSiteSupportsResource(): Promise<void> {
    const kind = commandResourceKind(this.id)
    if (!kind) return
    let missing
    try {
      missing = missingIntegration(kind, await this.capabilities())
    } catch {
      return
    }

    if (!missing) return
    const declared = await declaredPlugins({localConfig: this.localConfig, rootDir: this.rootDir, siteName: this.siteConfig.name})
    this.error(unsupportedMessage(missing, this.siteConfig.name, declared))
  }

  // Environments written before types existed have none: the production guard can't tell what they are.
  private assertTyped(env: EnvironmentConfig): EnvironmentConfig {
    if (!isEnvironmentType(env.type)) {
      this.error(`Environment "${env.name}" has no type. Run \`lps project config\` to set it.`)
    }

    return env
  }

  private pickEnvironment(project: {environments: Record<string, EnvironmentConfig>; name: string}, envName: string): EnvironmentConfig {
    const env = project.environments[envName]
    if (!env) {
      this.error(
        `Environment "${envName}" not found in project "${project.name}". Available: ${Object.keys(project.environments).join(', ')}`,
      )
    }

    return this.assertTyped(env)
  }

  // Order: --env, then the project's default (see getDefaultEnvironment). The project comes from
  // loopress.json when pinned, from `lps project switch` otherwise.
  private resolveEnvironment(envName?: string): {env: EnvironmentConfig; projectId: string} {
    const projectId = this.localConfig.projectId ?? configManager.getCurrentProject()?.id
    if (!projectId) this.error('No project configured. Run `lps project config` first.')

    const project = configManager.getProject(projectId)
    if (!project) {
      this.error(`Project "${projectId}" (from loopress.json) not found. Run \`lps project config\` to configure it.`)
    }

    this.projectEnvironments = Object.values(project.environments)
    const envNames = Object.keys(project.environments)
    if (envNames.length === 0) {
      this.error(`Project "${project.name}" has no environments configured. Run \`lps project config\` to add one.`)
    }

    if (envName) return {env: this.pickEnvironment(project, envName), projectId}

    const env = configManager.getDefaultEnvironment(projectId)
    if (!env) {
      this.error(
        `Project "${project.name}" has no "local" environment, pass --env to pick one. Available: ${envNames.join(', ')}`,
      )
    }

    return {env: this.assertTyped(env), projectId}
  }

  // Warn only, never block: WordPress answers "production" unless WP_ENVIRONMENT_TYPE is set, so a
  // local site configured as "local" usually disagrees.
  private warnOnEnvironmentTypeMismatch({environmentType}: SiteCapabilities): void {
    const reported = environmentType === 'development' ? 'local' : environmentType
    if (reported === this.siteConfig.type) return
    this.warn(
      `"${this.siteConfig.name}" is configured as type "${this.siteConfig.type}", but the site reports "${environmentType}" (wp_get_environment_type()). Set WP_ENVIRONMENT_TYPE on the site, or fix the type with \`lps project config\`.`,
    )
  }
}
