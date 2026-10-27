import {select} from '@inquirer/prompts'
import {Command} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'

export default class Switch extends Command {
  static override description = 'Switch the active project (pass --env to target a non-local environment)'
  static override examples = ['$ lps project switch']

  async run(): Promise<void> {
    await this.parse(Switch)

    const projects = configManager.listProjects()

    if (projects.length === 0) {
      this.error('No projects configured. Run `lps project config` first.')
    }

    const [only] = projects
    const currentId = projects.find((project) => project.isCurrent)?.id
    const projectId =
      only && projects.length === 1
        ? only.id
        : await select({
            choices: projects.map((project) => ({
              name: `${project.name}${project.isCurrent ? ' [current]' : ''}`,
              value: project.id,
            })),
            ...(currentId !== undefined && {default: currentId}),
            message: 'Select project',
          })

    configManager.setCurrent(projectId)

    const project = projects.find((candidate) => candidate.id === projectId)
    this.log(`✓ Switched to "${project?.name ?? projectId}"`)
  }
}
