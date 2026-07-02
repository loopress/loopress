import {Command, Flags} from '@oclif/core'
import {join} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {EnvironmentConfig} from '../types/config.js'
import {LoopressLocalConfig, readLocalConfig} from '../utils/loopress-config.js'
import {WpClient} from './wp-client.js'

interface ParsedBaseFlags {
  'dry-run'?: boolean
  password?: string
  url?: string
  user?: string
}

export abstract class LoopressCommand extends Command {
  static baseFlags = {
    password: Flags.string({
      description: 'WordPress application password (overrides project config, requires --user)',
      helpGroup: 'GLOBAL',
    }),
    url: Flags.string({
      description: 'WordPress URL (overrides project config)',
      helpGroup: 'GLOBAL',
    }),
    user: Flags.string({
      description: 'WordPress username (overrides project config, requires --password)',
      helpGroup: 'GLOBAL',
    }),
  }
  static dryRunFlag = {
    'dry-run': Flags.boolean({char: 'd', description: 'Show what would change without making changes'}),
  }
  protected dryRun = false
  protected localConfig: LoopressLocalConfig = {}
  protected siteConfig!: EnvironmentConfig
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
      flags: this.ctor.flags,
      strict: this.ctor.strict,
    })) as unknown as {flags: ParsedBaseFlags}

    this.dryRun = Boolean(flags['dry-run'])
    this.localConfig = await readLocalConfig()

    if (Boolean(flags.user) !== Boolean(flags.password)) {
      this.error('--user and --password must be provided together.')
    }

    const flagToken = flags.user && flags.password ? `${flags.user}:${flags.password}` : undefined

    if (flags.url) {
      this.siteConfig = {
        addedAt: new Date().toISOString(),
        name: 'cli-flags',
        token: flagToken,
        url: flags.url.replace(/\/+$/, ''),
      }
      return
    }

    const env = this.resolveEnvironment()
    this.siteConfig = flagToken ? {...env, token: flagToken} : env
  }

  protected resolveSnippetPlugin(flag?: string): 'code-snippets' | 'wpcode' {
    if (flag) return flag as 'code-snippets' | 'wpcode'
    return this.localConfig.snippetPlugin ?? 'wpcode'
  }

  protected resolveSnippetsPath(override?: string): string {
    if (override) return override
    return join(this.rootDir, this.localConfig.snippetsDir ?? 'snippets')
  }

  private resolveEnvironment(): EnvironmentConfig {
    if (this.localConfig.projectId) {
      const project = configManager.getProject(this.localConfig.projectId)
      if (!project) {
        this.error(
          `Project "${this.localConfig.projectId}" (from loopress.json) not found. Run \`lps project config\` to configure it.`,
        )
      }

      const envNames = Object.keys(project.environments)
      if (envNames.length === 0) {
        this.error(`Project "${project.name}" has no environments configured. Run \`lps project config\` to add one.`)
      }

      if (envNames.length === 1) {
        return project.environments[envNames[0]]
      }

      const current = configManager.getCurrentProject()
      const currentEnv = current?.id === this.localConfig.projectId ? configManager.getCurrentEnv() : null
      if (!currentEnv) {
        this.error(`Project "${project.name}" has multiple environments. Run \`lps project switch\` to pick one.`)
      }

      return currentEnv
    }

    const env = configManager.getCurrentEnv()
    if (env) return env

    this.error('No environment configured. Run `lps project config` first.')
  }
}
