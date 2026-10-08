import {select} from '@inquirer/prompts'
import {Command} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'

export default class Switch extends Command {
  static description = 'Switch the active project (pass --env to target a non-local environment)'
  static examples = ['$ lps project switch']

  async run(): Promise<void> {
    await this.parse(Switch)

    const projects = configManager.listProjects()

    if (projects.length === 0) {
      this.error('No projects configured. Run `lps project config` first.')
    }

    const projectId =
      projects.length === 1
        ? projects[0].id
        : await select({
            choices: projects.map((project) => ({
              name: `${project.name}${project.isCurrent ? ' [current]' : ''}`,
              value: project.id,
            })),
            default: projects.find((project) => project.isCurrent)?.id,
            message: 'Select project',
          })

    configManager.setCurrent(projectId)

    const project = projects.find((candidate) => candidate.id === projectId)!
    this.log(`✓ Switched to "${project.name}"`)
  }
}
