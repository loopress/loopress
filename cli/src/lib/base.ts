import {Command, Flags} from '@oclif/core'
import {join} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {EnvironmentConfig} from '../config/types.js'
import {readLocalConfig} from '../utils/loopress-config.js'

export abstract class LoopressCommand extends Command {
  static baseFlags = {
    password: Flags.string({
      description: 'WordPress application password (fallback; prefer `lps project config`)',
      helpGroup: 'GLOBAL',
    }),
    url: Flags.string({
      description: 'WordPress URL (fallback; prefer `lps project config`)',
      helpGroup: 'GLOBAL',
    }),
    user: Flags.string({
      description: 'WordPress username (fallback; prefer `lps project config`)',
      helpGroup: 'GLOBAL',
    }),
  }
  protected siteConfig!: EnvironmentConfig

  async buildAuthHeaders(): Promise<Record<string, string>> {
    const {token, url} = this.siteConfig

    if (token) {
      return {Authorization: `Basic ${Buffer.from(token).toString('base64')}`}
    }

    this.error(`No credentials configured for ${url}. Run \`lps project config\` to add them.`)
  }

  async init(): Promise<void> {
    await super.init()

    const localConfig = await readLocalConfig()

    if (localConfig.projectId) {
      const project = configManager.getProject(localConfig.projectId)
      if (!project) {
        this.error(`Project "${localConfig.projectId}" (from loopress.json) not found. Run \`lps project config\` to configure it.`)
      }

      const envNames = Object.keys(project.environments)
      if (envNames.length === 0) {
        this.error(`Project "${project.name}" has no environments configured. Run \`lps project config\` to add one.`)
      }

      if (envNames.length === 1) {
        this.siteConfig = project.environments[envNames[0]]
        return
      }

      const current = configManager.getCurrentProject()
      const currentEnv = current?.id === localConfig.projectId ? configManager.getCurrentEnv() : null
      if (!currentEnv) {
        this.error(`Project "${project.name}" has multiple environments. Run \`lps project switch\` to pick one.`)
      }

      this.siteConfig = currentEnv
      return
    }

    const env = configManager.getCurrentEnv()
    if (env) {
      this.siteConfig = env
      return
    }

    this.error('No environment configured. Run `lps project config` first.')
  }

  protected async resolveSnippetPlugin(flag?: string): Promise<'code-snippets' | 'wpcode'> {
    if (flag) return flag as 'code-snippets' | 'wpcode'
    const config = await readLocalConfig()
    return config.snippetPlugin ?? 'wpcode'
  }

  protected async resolveSnippetsPath(override?: string): Promise<string> {
    if (override) return override
    const config = await readLocalConfig()
    return join(config.rootDir ?? '.', config.snippetsDir ?? 'snippets')
  }
}
