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

    const env = configManager.getCurrentEnv()
    if (env) {
      this.siteConfig = env
      return
    }

    this.error('No environment configured. Run `lps project config` first.')
  }

  protected async resolveSnippetsPath(override?: string): Promise<string> {
    if (override) return override
    const config = await readLocalConfig()
    return join(config.rootDir ?? '.', config.snippets ?? 'snippets')
  }

  protected async resolveStylesPath(override?: string): Promise<string> {
    if (override) return override
    const config = await readLocalConfig()
    return join(config.rootDir ?? '.', config.styles ?? 'styles')
  }
}
