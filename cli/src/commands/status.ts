import {Command, Flags, ux} from '@oclif/core'

import {configManager} from '../config/project-config.manager.js'
import {readLocalConfig} from '../utils/loopress-config.js'

const c = ux.colorize

export default class Status extends Command {
  static description = 'Show which WordPress project and environment commands will target'
  static examples = ['$ lps status', '$ lps status --env staging']
  static flags = {
    env: Flags.string({description: 'Show what would be targeted with this environment, as other commands do with --env'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Status)

    const localConfig = await readLocalConfig()

    if (flags.env) {
      this.reportEnvOverride(localConfig.projectId, flags.env)
    } else if (localConfig.projectId) {
      this.reportPinnedProject(localConfig.projectId)
    } else {
      this.reportActiveProject()
    }

    this.log('')
    this.log(`Config dir: ${this.config.configDir}`)
    this.log(`Data dir:   ${this.config.dataDir}`)
  }

  // Mirrors base.ts:resolveEnvironment with --env: the targeted project comes from
  // loopress.json when pinned, from the globally active project otherwise.
  private reportEnvOverride(pinnedProjectId: string | undefined, envName: string): void {
    const project = pinnedProjectId ? configManager.getProject(pinnedProjectId) : configManager.getCurrentProject()

    if (!project) {
      this.log('No project configured. Run `lps project config` first.')
      return
    }

    const env = project.environments[envName]
    if (!env) {
      this.error(
        `Environment "${envName}" not found in project "${project.name}". Available: ${Object.keys(project.environments).join(', ')}`,
      )
    }

    this.log(`Project:  ${project.name} (${env.name}, via --env)`)
    this.log(`URL:      ${env.url}`)
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
