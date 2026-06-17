import {Command} from '@oclif/core'
import {checkbox} from '@inquirer/prompts'

import {configManager} from '../../config/project-config.manager.js'

export default class Remove extends Command {
  static description = 'Remove one or more WordPress project configurations'
  static examples = ['$ wdx project remove']

  async run(): Promise<void> {
    await this.parse(Remove)

    const projects = configManager.listProjects()

    if (projects.length === 0) {
      this.error('No projects configured.')
    }

    const chosen = await checkbox({
      message: 'Select projects to remove',
      choices: projects.map((project) => {
        const envCount = Object.keys(project.environments).length
        const envLabel = `${envCount} env${envCount > 1 ? 's' : ''}`
        const currentMarker = project.isCurrent ? ' [current]' : ''
        return {
          name: `${project.isCurrent ? '●' : '○'} ${project.name.padEnd(20)} (${envLabel})${currentMarker}`,
          value: project.name,
        }
      }),
    })

    if (chosen.length === 0) {
      this.log('Nothing removed.')
      return
    }

    for (const name of chosen) {
      configManager.removeProject(name)
    }

    this.log(`✓ Removed: ${chosen.join(', ')}`)
  }
}
