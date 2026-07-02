import {select} from '@inquirer/prompts'
import {Command} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'
import {ProjectConfig} from '../../types/config.js'

export default class Switch extends Command {
  static description = 'Switch the active project and environment'
  static examples = ['$ lps project switch']

  async run(): Promise<void> {
    await this.parse(Switch)

    const projects = configManager.listProjects()

    if (projects.length === 0) {
      this.error('No projects configured. Run `lps project config` first.')
    }

    const {id: projectId, name: projectName} = await this.resolveProject(projects)
    const envName = await this.resolveEnvironment(projectId, projectName)

    configManager.setCurrent(projectId, envName)

    this.log(`✓ Switched to "${projectName}/${envName}"`)
  }

  private async resolveEnvironment(projectId: string, projectName: string): Promise<string> {
    const envs = configManager.listEnvironments(projectId)

    if (envs.length === 0) {
      this.error(`No environments configured for "${projectName}". Run \`lps project config\` first.`)
    }

    if (envs.length === 1) return envs[0].name

    return select({
      choices: envs.map((env) => ({
        name: `${env.isCurrent ? '●' : '○'} ${env.name.padEnd(20)} ${env.url}${env.isCurrent ? ' [current]' : ''}`,
        value: env.name,
      })),
      default: envs.find((env) => env.isCurrent)?.name,
      message: `Select environment for "${projectName}"`,
    })
  }

  private async resolveProject(
    projects: Array<ProjectConfig & {id: string; isCurrent: boolean}>,
  ): Promise<{id: string; name: string}> {
    if (projects.length === 1) return {id: projects[0].id, name: projects[0].name}

    const chosen = await select({
      choices: projects.map((project) => {
        const envCount = Object.keys(project.environments).length
        const envLabel = `${envCount} env${envCount > 1 ? 's' : ''}`
        const currentMarker = project.isCurrent ? ' [current]' : ''
        return {
          name: `${project.isCurrent ? '●' : '○'} ${project.name.padEnd(20)} (${envLabel})${currentMarker}`,
          value: project.id,
        }
      }),
      default: projects.find((project) => project.isCurrent)?.id,
      message: 'Select active project',
    })

    const project = projects.find((p) => p.id === chosen)!
    return {id: project.id, name: project.name}
  }
}
