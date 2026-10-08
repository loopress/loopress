import {Command, Flags, ux} from '@oclif/core'

import {configManager} from '../config/project-config.manager.js'
import {type EnvironmentConfig} from '../types/config.js'
import {readLocalConfig} from '../utils/loopress-config.js'

const c = ux.colorize

type StatusInfo = {
  // Name of the environment commands will target, when one resolves. The MCP server reads it to
  // pin a mutating call to the environment it previewed (and to refuse production).
  environment?: string
  environments?: string[]
  note?: string
  project?: string
  url?: string
}

type StatusResult = StatusInfo & {
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

    const {projectId} = await readLocalConfig()
    const info = this.report(projectId, flags.env)

    this.log('')
    this.log(`Config dir: ${this.config.configDir}`)
    this.log(`Data dir:   ${this.config.dataDir}`)

    return {...info, configDir: this.config.configDir, dataDir: this.config.dataDir}
  }

  private logTarget(label: string, env: EnvironmentConfig): StatusInfo {
    this.log(`Project:  ${label}`)
    this.log(`URL:      ${env.url}`)
    return {environment: env.name, project: label, url: env.url}
  }

  // Mirrors base.ts:resolveEnvironment, reporting instead of failing where it can.
  private report(pinnedProjectId: string | undefined, envName: string | undefined): StatusInfo {
    const projectId = pinnedProjectId ?? configManager.getCurrentProject()?.id
    if (!projectId) {
      const note = 'No project configured. Run `lps project config` first.'
      this.log(note)
      return {note}
    }

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

    if (envName) {
      const env = project.environments[envName]
      if (!env) {
        this.error(`Environment "${envName}" not found in project "${project.name}". Available: ${envNames.join(', ')}`)
      }

      return this.logTarget(`${project.name} (${env.name}, via --env)`, env)
    }

    const env = configManager.getDefaultEnvironment(projectId)
    if (!env) {
      const note = `"${project.name}" has no "local" environment, pass --env to pick one.`
      this.log(`Project:  ${project.name} ${c('yellow', '(no default environment)')}`)
      this.log(`Environments: ${envNames.join(', ')}`)
      this.log('')
      this.warn(note)
      return {environments: envNames, note, project: project.name}
    }

    return this.logTarget(`${project.name} (${env.name})`, env)
  }
}
