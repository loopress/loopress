import {select, Separator} from '@inquirer/prompts'
import {Command, ux} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'
import {ProjectConfig} from '../../types/config.js'

const c = ux.colorize

export default class Switch extends Command {
  static description = 'Switch the active project and environment'
  static examples = ['$ lps project switch']

  async run(): Promise<void> {
    await this.parse(Switch)

    const projects = configManager.listProjects()

    if (projects.length === 0) {
      this.error('No projects configured. Run `lps project config` first.')
    }

    const {envName, projectId, projectName} = await this.resolveSelection(projects)

    configManager.setCurrent(projectId, envName)

    this.log(`✓ Switched to "${projectName}/${envName}"`)
  }

  private async resolveSelection(
    projects: Array<ProjectConfig & {id: string; isCurrent: boolean}>,
  ): Promise<{envName: string; projectId: string; projectName: string}> {
    const groups = projects
      .map((project) => ({envs: configManager.listEnvironments(project.id), project}))
      .filter(({envs}) => envs.length > 0)

    if (groups.length === 0) {
      this.error('No environments configured. Run `lps project config` first.')
    }

    const entries = groups.flatMap(({envs, project}) => envs.map((env) => ({env, project})))
    if (entries.length === 1) {
      const {env, project} = entries[0]
      return {envName: env.name, projectId: project.id, projectName: project.name}
    }

    const choices = groups.flatMap(({envs, project}) => [
      new Separator(project.isCurrent ? c('green', `─── ${project.name} ───`) : c('dim', `─── ${project.name} ───`)),
      ...envs.map((env) => ({
        name: `${env.name.padEnd(20)} ${env.url}${env.isCurrent ? ' [current]' : ''}`,
        value: `${project.id}::${env.name}`,
      })),
    ])

    const current = entries.find(({env}) => env.isCurrent)

    const chosen = await select({
      choices,
      default: current && `${current.project.id}::${current.env.name}`,
      message: 'Select project / environment',
    })

    const [projectId, envName] = chosen.split('::')
    const {project} = groups.find((group) => group.project.id === projectId)!

    return {envName, projectId, projectName: project.name}
  }
}
