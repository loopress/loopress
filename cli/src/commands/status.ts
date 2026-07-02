import {Command, ux} from '@oclif/core'

import {configManager} from '../config/project-config.manager.js'
import {readLocalConfig} from '../utils/loopress-config.js'

const c = ux.colorize

export default class Status extends Command {
  static description = 'Show which WordPress project and environment commands will target'
  static examples = ['$ lps status']

  async run(): Promise<void> {
    await this.parse(Status)

    const localConfig = await readLocalConfig()

    if (localConfig.projectId) {
      this.reportPinnedProject(localConfig.projectId)
      return
    }

    this.reportActiveProject()
  }

  private reportActiveProject(): void {
    const env = configManager.getCurrentEnv()

    if (!env) {
      this.log('No project configured. Run `lps project config` first.')
      return
    }

    const project = configManager.getCurrentProject()

    if (!project) {
      this.log('No project configured. Run `lps project config` first.')
      return
    }

    this.log(`Project:  ${project.name} (${env.name})`)
    this.log(`URL:      ${env.url}`)
  }

  private reportPinnedProject(projectId: string): void {
    const project = configManager.getProject(projectId)

    if (!project) {
      this.log(`loopress.json pins project "${projectId}", but it no longer exists.`)
      this.log('Run `lps project config` to configure it.')
      return
    }

    const envNames = Object.keys(project.environments)

    if (envNames.length === 0) {
      this.log(`Project:  ${project.name}`)
      this.log('No environments configured for this project. Run `lps project config` to add one.')
      return
    }

    if (envNames.length === 1) {
      const env = project.environments[envNames[0]]
      this.log(`Project:  ${project.name} (${env.name})`)
      this.log(`URL:      ${env.url}`)
      return
    }

    const current = configManager.getCurrentProject()
    const currentEnv = current?.id === projectId ? configManager.getCurrentEnv() : null

    if (!currentEnv) {
      this.log(`Project:  ${project.name} ${c('yellow', '(ambiguous)')}`)
      this.log(`Environments: ${envNames.join(', ')}`)
      this.log('')
      this.warn(`"${project.name}" has multiple environments and isn't the globally active project.`)
      this.log('Run `lps project switch` to pick one before running commands here.')
      if (current) {
        this.log(`(Globally active project right now: "${current.name}")`)
      }

      return
    }

    this.log(`Project:  ${project.name} (${currentEnv.name})`)
    this.log(`URL:      ${currentEnv.url}`)
  }
}
