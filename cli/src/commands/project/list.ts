import {Command, ux} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'

const c = ux.colorize

type EnvironmentInfo = {
  isCurrent: boolean
  name: string
  url: string
}

type ProjectInfo = {
  environments: EnvironmentInfo[]
  id: string
  isCurrent: boolean
  name: string
}

export default class List extends Command {
  static description = 'List configured WordPress projects'
  static enableJsonFlag = true
  static examples = ['$ lps project list']

  async run(): Promise<ProjectInfo[]> {
    await this.parse(List)

    const projects = configManager.listProjects()

    if (projects.length === 0) {
      this.log('No projects configured. Run `lps project config` first.')
      return []
    }

    return projects.map((project) => this.logProject(project))
  }

  // Only name/url/isCurrent are surfaced, deliberately: EnvironmentConfig also carries the
  // WordPress application password token, which must never end up in --json output.
  private logEnvironment(env: ReturnType<typeof configManager.listEnvironments>[number]): EnvironmentInfo {
    const envMarker = c(env.isCurrent ? 'cyan' : 'dim', '·')
    const envName = c(env.isCurrent ? 'cyan' : 'dim', env.name.padEnd(15))
    const envUrl = c('dim', env.url)
    const activeTag = env.isCurrent ? ` ${c('cyan', '←')}` : ''
    this.log(`  ${envMarker} ${envName} ${envUrl}${activeTag}`)
    return {isCurrent: env.isCurrent, name: env.name, url: env.url}
  }

  private logProject(project: ReturnType<typeof configManager.listProjects>[number]): ProjectInfo {
    const marker = project.isCurrent ? c('green', '●') : c('dim', '○')
    const name = project.isCurrent ? c('green', project.name) : project.name
    const currentTag = project.isCurrent ? ` ${c('green', '[current]')}` : ''

    this.log(`${marker} ${name}${currentTag}`)

    const environments = configManager.listEnvironments(project.id).map((env) => this.logEnvironment(env))

    this.log('')

    return {environments, id: project.id, isCurrent: project.isCurrent, name: project.name}
  }
}
