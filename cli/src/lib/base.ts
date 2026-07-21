import {Command, Flags} from '@oclif/core'
import {join} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {EnvironmentConfig} from '../types/config.js'
import {LoopressLocalConfig, readLocalConfig} from '../utils/loopress-config.js'
import {WpClient} from './wp-client.js'

interface ParsedBaseFlags {
  'dry-run'?: boolean
}

export abstract class LoopressCommand extends Command {
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
    this.siteConfig = this.resolveEnvironment()
  }

  protected resolveAcfPath(override?: string): string {
    if (override) return override
    return join(this.rootDir, this.localConfig.acfDir ?? 'acf')
  }

  protected resolveRankmathPath(override?: string): string {
    if (override) return override
    return join(this.rootDir, this.localConfig.rankmathDir ?? 'rankmath')
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
