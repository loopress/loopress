import {Command} from '@oclif/core'
import {checkbox} from '@inquirer/prompts'

import {configManager} from '../../config/project-config.manager.js'

export default class RemoveEnv extends Command {
  static description = 'Remove one or more environments from the current project'
  static examples = ['$ wdx project remove-env']

  async run(): Promise<void> {
    await this.parse(RemoveEnv)

    const project = configManager.getCurrentProject()

    if (!project) {
      this.error('No project configured. Run `wdx project config` first.')
    }

    const envs = configManager.listEnvironments(project.name)

    if (envs.length === 0) {
      this.error('No environments configured.')
    }

    const chosen = await checkbox({
      message: 'Select environments to remove',
      choices: envs.map((env) => ({
        name: `${env.isCurrent ? '●' : '○'} ${env.name.padEnd(20)} ${env.url}${env.isCurrent ? ' [current]' : ''}`,
        value: env.name,
      })),
    })

    if (chosen.length === 0) {
      this.log('Nothing removed.')
      return
    }

    for (const envName of chosen) {
      configManager.removeEnvironment(project.name, envName)
    }

    this.log(`✓ Removed: ${chosen.join(', ')}`)
  }
}
