import {Command, Flags} from '@oclif/core'

import {configManager} from '../config/project-config.manager.js'
import {EnvironmentConfig} from '../config/types.js'
import {isLocalUrl} from '../utils/local-detection.js'

export abstract class WordpressDXCommand extends Command {
  protected siteConfig!: EnvironmentConfig

  // Kept for backward compatibility (CI, env vars, direct flag override).
  // Values are used as fallback when no config.json entry is active.
  static baseFlags = {
    password: Flags.string({
      description: 'WordPress application password (fallback; prefer `wdx project config`)',
      env: 'WP_APP_PASSWORD',
      helpGroup: 'GLOBAL',
    }),
    url: Flags.string({
      description: 'WordPress URL (fallback; prefer `wdx project config`)',
      env: 'WP_URL',
      helpGroup: 'GLOBAL',
    }),
    user: Flags.string({
      description: 'WordPress username (fallback; prefer `wdx project config`)',
      env: 'WP_USERNAME',
      helpGroup: 'GLOBAL',
    }),
  }

  async init(): Promise<void> {
    await super.init()

    const env = configManager.getCurrentEnv()
    if (env) {
      this.siteConfig = env
      return
    }

    // Fallback: construct a transient env config from env vars / legacy flags.
    // The flags read their values from the WP_* env vars via the `env:` option,
    // so reading process.env directly here covers both env-var and --flag usage
    // without needing a second this.parse() call in init().
    const url = process.env.WP_URL
    const user = process.env.WP_USERNAME
    const password = process.env.WP_APP_PASSWORD

    if (url && await isLocalUrl(url)) {
      this.siteConfig = {
        name: '_env',
        url,
        ...(user && password ? {token: `${user}:${password}`} : {}),
        addedAt: new Date().toISOString(),
      }
      return
    }

    this.error('No environment configured. Run `wdx project config` first.')
  }

  async buildAuthHeaders(): Promise<Record<string, string>> {
    const {token, url} = this.siteConfig

    if (token) {
      return {Authorization: `Basic ${Buffer.from(token).toString('base64')}`}
    }

    this.error(`No credentials configured for ${url}. Run \`wdx project config\` to add them.`)
  }
}
