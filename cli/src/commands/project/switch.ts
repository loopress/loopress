import {Command} from '@oclif/core'
import {select} from '@inquirer/prompts'

import {configManager} from '../../config/project-config.manager.js'

export default class Switch extends Command {
  static description = 'Switch the active project'
  static examples = ['$ wdx project switch']

  async run(): Promise<void> {
    await this.parse(Switch)

    const projects = configManager.listProjects()

    if (projects.length === 0) {
      this.error('No projects configured. Run `wdx project config` first.')
    }

    if (projects.length === 1) {
      configManager.setCurrentProject(projects[0].name)
      this.log(`✓ Switched to "${projects[0].name}"`)
      return
    }

    const chosen = await select({
      message: 'Select active project',
      choices: projects.map((project) => {
        const envCount = Object.keys(project.environments).length
        const envLabel = `${envCount} env${envCount > 1 ? 's' : ''}`
        const currentMarker = project.isCurrent ? ' [current]' : ''
        return {
          name: `${project.isCurrent ? '●' : '○'} ${project.name.padEnd(20)} (${envLabel})${currentMarker}`,
          value: project.name,
        }
      }),
      default: projects.find((p) => p.isCurrent)?.name,
    })

    configManager.setCurrentProject(chosen)
    this.log(`✓ Switched to "${chosen}"`)
  }
}
