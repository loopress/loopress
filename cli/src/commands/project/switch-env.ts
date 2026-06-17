import {Command} from '@oclif/core'
import {select} from '@inquirer/prompts'

import {configManager} from '../../config/project-config.manager.js'

export default class SwitchEnv extends Command {
  static description = 'Switch the active environment within the current project'
  static examples = ['$ lps project switch-env']

  async run(): Promise<void> {
    await this.parse(SwitchEnv)

    const project = configManager.getCurrentProject()

    if (!project) {
      this.error('No project configured. Run `lps project config` first.')
    }

    const envs = configManager.listEnvironments(project.name)

    if (envs.length === 0) {
      this.error('No environments configured for this project.')
    }

    if (envs.length === 1) {
      configManager.setCurrentEnv(project.name, envs[0].name)
      this.log(`✓ Switched to "${project.name}/${envs[0].name}"`)
      return
    }

    const chosen = await select({
      message: `Select environment for "${project.name}"`,
      choices: envs.map((env) => ({
        name: `${env.isCurrent ? '●' : '○'} ${env.name.padEnd(20)} ${env.url}${env.isCurrent ? ' [current]' : ''}`,
        value: env.name,
      })),
      default: envs.find((e) => e.isCurrent)?.name,
    })

    configManager.setCurrentEnv(project.name, chosen)
    this.log(`✓ Switched to "${project.name}/${chosen}"`)
  }
}
