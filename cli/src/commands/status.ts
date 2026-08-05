import {Command, Flags, ux} from '@oclif/core'

import {configManager} from '../config/project-config.manager.js'
import {readLocalConfig} from '../utils/loopress-config.js'

const c = ux.colorize

interface StatusInfo {
  environments?: string[]
  note?: string
  project?: string
  url?: string
}

interface StatusResult extends StatusInfo {
  configDir: string
  dataDir: string
}

export default class Status extends Command {
  static description = 'Show which WordPress project and environment commands will target'
  static enableJsonFlag = true
  static examples = ['$ lps status', '$ lps status --env staging']
  static flags = {
    env: Flags.string({description: 'Show what would be targeted with this environment, as other commands do with --env'}),
  }

  async run(): Promise<StatusResult> {
    const {flags} = await this.parse(Status)

    const localConfig = await readLocalConfig()

    let info: StatusInfo
    if (flags.env) {
      info = this.reportEnvOverride(localConfig.projectId, flags.env)
    } else if (localConfig.projectId) {
      info = this.reportPinnedProject(localConfig.projectId)
    } else {
      info = this.reportActiveProject()
    }

    this.log('')
    this.log(`Config dir: ${this.config.configDir}`)
    this.log(`Data dir:   ${this.config.dataDir}`)

    return {...info, configDir: this.config.configDir, dataDir: this.config.dataDir}
  }

  private reportActiveProject(): StatusInfo {
    const env = configManager.getCurrentEnv()
    const project = env ? configManager.getCurrentProject() : undefined

    if (!env || !project) {
      const note = 'No project configured. Run `lps project config` first.'
      this.log(note)
      return {note}
    }

    this.log(`Project:  ${project.name} (${env.name})`)
    this.log(`URL:      ${env.url}`)
    return {project: `${project.name} (${env.name})`, url: env.url}
  }

  // Mirrors base.ts:resolveEnvironment with --env: the targeted project comes from
  // loopress.json when pinned, from the globally active project otherwise.
  private reportEnvOverride(pinnedProjectId: string | undefined, envName: string): StatusInfo {
    const project = pinnedProjectId ? configManager.getProject(pinnedProjectId) : configManager.getCurrentProject()

    if (!project) {
      const note = 'No project configured. Run `lps project config` first.'
      this.log(note)
      return {note}
    }

    const env = project.environments[envName]
    if (!env) {
      this.error(
        `Environment "${envName}" not found in project "${project.name}". Available: ${Object.keys(project.environments).join(', ')}`,
      )
    }

    this.log(`Project:  ${project.name} (${env.name}, via --env)`)
    this.log(`URL:      ${env.url}`)
    return {project: `${project.name} (${env.name}, via --env)`, url: env.url}
  }

  private reportPinnedProject(projectId: string): StatusInfo {
    const project = configManager.getProject(projectId)

    if (!project) {
      const note = `loopress.json pins project "${projectId}", but it no longer exists. Run \`lps project config\` to configure it.`
      this.log(`loopress.json pins project "${projectId}", but it no longer exists.`)
      this.log('Run `lps project config` to configure it.')
      return {note}
    }

    const envNames = Object.keys(project.environments)

    if (envNames.length === 0) {
      const note = 'No environments configured for this project. Run `lps project config` to add one.'
      this.log(`Project:  ${project.name}`)
      this.log(note)
      return {note, project: project.name}
    }

    if (envNames.length === 1) {
      const env = project.environments[envNames[0]]
      this.log(`Project:  ${project.name} (${env.name})`)
      this.log(`URL:      ${env.url}`)
      return {project: `${project.name} (${env.name})`, url: env.url}
    }

    const current = configManager.getCurrentProject()
    const currentEnv = current?.id === projectId ? configManager.getCurrentEnv() : null

    if (!currentEnv) {
      const note = `"${project.name}" has multiple environments and isn't the globally active project. Run \`lps project switch\` to pick one.`
      this.log(`Project:  ${project.name} ${c('yellow', '(ambiguous)')}`)
      this.log(`Environments: ${envNames.join(', ')}`)
      this.log('')
      this.warn(`"${project.name}" has multiple environments and isn't the globally active project.`)
      this.log('Run `lps project switch` to pick one before running commands here.')
      if (current) {
        this.log(`(Globally active project right now: "${current.name}")`)
      }

      return {environments: envNames, note, project: project.name}
    }

    this.log(`Project:  ${project.name} (${currentEnv.name})`)
    this.log(`URL:      ${currentEnv.url}`)
    return {project: `${project.name} (${currentEnv.name})`, url: currentEnv.url}
  }
}
