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

    for (const project of projects) {
      const envs = Object.values(project.environments)
      const marker = project.isCurrent ? c('green', '●') : c('dim', '○')
      const name = project.isCurrent ? c('green', project.name) : project.name
      const currentTag = project.isCurrent ? ` ${c('green', '[current]')}` : ''

      this.log(`${marker} ${name}${currentTag}`)

      for (const env of envs) {
        const isActiveEnv = env.name === project.currentEnv
        const envMarker = isActiveEnv ? c('cyan', '·') : c('dim', '·')
        const envName = isActiveEnv ? c('cyan', env.name.padEnd(15)) : c('dim', env.name.padEnd(15))
        const envUrl = c('dim', env.url)
        const activeTag = isActiveEnv ? ` ${c('cyan', '←')}` : ''
        this.log(`  ${envMarker} ${envName} ${envUrl}${activeTag}`)
      }

      this.log('')
    }
  }
}
