import {Command, ux} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'

const c = ux.colorize

export default class List extends Command {
  static description = 'List configured WordPress projects'
  static examples = ['$ lps project list']

  async run(): Promise<void> {
    await this.parse(List)

    const projects = configManager.listProjects()

    if (projects.length === 0) {
      this.log('No projects configured. Run `lps project config` first.')
      return
    }

    for (const project of projects) this.logProject(project)
  }

  private logEnvironment(env: ReturnType<typeof configManager.listEnvironments>[number]): void {
    const envMarker = c(env.isCurrent ? 'cyan' : 'dim', '·')
    const envName = c(env.isCurrent ? 'cyan' : 'dim', env.name.padEnd(15))
    const envUrl = c('dim', env.url)
    const activeTag = env.isCurrent ? ` ${c('cyan', '←')}` : ''
    this.log(`  ${envMarker} ${envName} ${envUrl}${activeTag}`)
  }

  private logProject(project: ReturnType<typeof configManager.listProjects>[number]): void {
    const marker = project.isCurrent ? c('green', '●') : c('dim', '○')
    const name = project.isCurrent ? c('green', project.name) : project.name
    const currentTag = project.isCurrent ? ` ${c('green', '[current]')}` : ''

    this.log(`${marker} ${name}${currentTag}`)

    for (const env of configManager.listEnvironments(project.id)) this.logEnvironment(env)

    this.log('')
  }
}
