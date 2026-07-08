import {confirm, input, password as passwordPrompt, select} from '@inquirer/prompts'
import {Command} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'
import {authorizeWithBrowser} from '../../lib/wp-authorize-flow.js'
import {diagnoseWpSite} from '../../lib/wp-site-diagnostic.js'
import {EnvironmentConfig, ProjectConfig} from '../../types/config.js'

const NEW_PROJECT = '__new__'
const AUTH_BROWSER = 'browser'
const AUTH_MANUAL = 'manual'

export default class Config extends Command {
  static description =
    'Add or update a WordPress project environment. By default, authorizes via WordPress in your browser; manual username/Application Password entry is available as a fallback.'
  static examples = ['$ lps project config']

  async run(): Promise<void> {
    await this.parse(Config)

    const {projectId, projectName} = await this.resolveProject()

    const envChoice = await select({
      choices: [
        {name: 'local', value: 'local'},
        {name: 'staging', value: 'staging'},
        {name: 'production', value: 'production'},
        {name: 'Custom…', value: '__custom__'},
      ],
      message: 'Environment',
    })

    const envName =
      envChoice === '__custom__'
        ? await input({
            message: 'Environment name',
            validate: (value) => (value.trim().length > 0 ? true : 'Name cannot be empty'),
          })
        : envChoice

    const existingEnv = configManager.getEnvironment(projectId, envName)

    if (existingEnv) {
      const overwrite = await confirm({
        default: false,
        message: `"${projectName}/${envName}" already exists. Overwrite?`,
      })
      if (!overwrite) {
        this.log('Aborted.')
        return
      }
    }

    const rawUrl = await input({
      message: 'WordPress URL',
      validate(value) {
        try {
          const parsed = new URL(value)
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            return 'URL must start with http:// or https://'
          }

          return true
        } catch {
          return 'Invalid URL'
        }
      },
    })
    const url = rawUrl.replace(/\/+$/, '')

    const {appPassword, user} = await this.resolveCredentials(url)

    const token = `${user}:${appPassword}`

    const env: EnvironmentConfig = {
      addedAt: new Date().toISOString(),
      name: envName,
      token,
      url,
    }

    if (configManager.getProject(projectId)) {
      configManager.setEnvironment(projectId, envName, env)
    } else {
      const project: ProjectConfig = {
        addedAt: new Date().toISOString(),
        environments: {[envName]: env},
        name: projectName,
      }
      configManager.setProject(projectId, project)
    }

    this.log(`✓ "${projectName}/${envName}" configured`)
    this.log('→ Run `lps project switch` to change the active project or environment')
  }

  private async promptManualCredentials(): Promise<{appPassword: string; user: string}> {
    const user = await input({
      message: 'Username',
      validate: (value) => (value.trim().length > 0 ? true : 'Username cannot be empty'),
    })

    const appPassword = await passwordPrompt({
      mask: '*',
      message: 'Application password',
      validate: (value) => (value.trim().length > 0 ? true : 'Application password cannot be empty'),
    })

    return {appPassword, user}
  }

  private async resolveCredentials(url: string): Promise<{appPassword: string; user: string}> {
    const authMode = await select({
      choices: [
        {name: 'Authorize in my browser (recommended)', value: AUTH_BROWSER},
        {name: 'Enter credentials manually', value: AUTH_MANUAL},
      ],
      message: 'How do you want to authenticate?',
    })

    if (authMode === AUTH_MANUAL) {
      return this.promptManualCredentials()
    }

    const diagnostic = await diagnoseWpSite(url)
    if (!diagnostic.ok) {
      this.warn(`${diagnostic.reason}\nFalling back to manual credential entry.`)
      return this.promptManualCredentials()
    }

    try {
      const {password, userLogin} = await authorizeWithBrowser(url, (message) => this.log(message))
      return {appPassword: password, user: userLogin}
    } catch (error) {
      this.warn(`${(error as Error).message}\nFalling back to manual credential entry.`)
      return this.promptManualCredentials()
    }
  }

  private async resolveProject(): Promise<{projectId: string; projectName: string}> {
    const projects = configManager.listProjects()

    if (projects.length > 0) {
      const choice = await select({
        choices: [
          ...projects.map((project) => ({name: project.name, value: project.id})),
          {name: 'Add a new project…', value: NEW_PROJECT},
        ],
        message: 'Project',
      })

      if (choice !== NEW_PROJECT) {
        const project = projects.find((p) => p.id === choice)!
        return {projectId: project.id, projectName: project.name}
      }
    }

    const existingNames = new Set(projects.map((project) => project.name.trim().toLowerCase()))

    const projectName = await input({
      message: 'Project name',
      validate(value) {
        const trimmed = value.trim()
        if (trimmed.length === 0) return 'Name cannot be empty'
        if (existingNames.has(trimmed.toLowerCase())) return `A project named "${trimmed}" already exists`
        return true
      },
    })

    return {projectId: configManager.createProjectId(projectName.trim()), projectName: projectName.trim()}
  }
}
