import {Command} from '@oclif/core'
import {confirm, input, password as passwordPrompt, select} from '@inquirer/prompts'

import {configManager} from '../../config/project-config.manager.js'
import {EnvironmentConfig, ProjectConfig} from '../../config/types.js'
import {isLocalUrl} from '../../utils/local-detection.js'

export default class Config extends Command {
  static description = 'Add or update a WordPress project environment'
  static examples = ['$ wdx project config']

  async run(): Promise<void> {
    await this.parse(Config)

    const projectName = await input({
      message: 'Project name (identifier, no spaces)',
      validate: (value) => {
        if (!/^[a-z0-9_-]+$/.test(value)) {
          return 'Name must be lowercase with only letters, numbers, - and _'
        }

        return true
      },
    })

    const envChoice = await select({
      message: 'Environment',
      choices: [
        {value: 'production', name: 'production'},
        {value: 'staging', name: 'staging'},
        {value: 'development', name: 'development'},
        {value: '__custom__', name: 'Custom…'},
      ],
    })

    const envName =
      envChoice === '__custom__'
        ? await input({
            message: 'Environment name',
            validate: (value) => (value.trim().length > 0 ? true : 'Name cannot be empty'),
          })
        : envChoice

    const existingProject = configManager.getProject(projectName)
    const existingEnv = existingProject?.environments[envName]

    if (existingEnv) {
      const overwrite = await confirm({
        message: `"${projectName}/${envName}" already exists. Overwrite?`,
        default: false,
      })
      if (!overwrite) {
        this.log('Aborted.')
        return
      }
    }

    const url = await input({
      message: 'WordPress URL',
      validate: (value) => {
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

    const user = await input({
      message: 'Username',
      validate: (value) => (value.trim().length > 0 ? true : 'Username cannot be empty'),
    })

    const appPassword = await passwordPrompt({
      message: 'Application password',
      mask: '*',
      validate: (value) => (value.trim().length > 0 ? true : 'Application password cannot be empty'),
    })

    const token = `${user}:${appPassword}`

    const env: EnvironmentConfig = {
      name: envName,
      url,
      token,
      addedAt: new Date().toISOString(),
    }

    if (!existingProject) {
      const project: ProjectConfig = {
        name: projectName,
        currentEnv: envName,
        environments: {[envName]: env},
        addedAt: new Date().toISOString(),
      }
      configManager.setProject(projectName, project)
    } else {
      configManager.setEnvironment(projectName, envName, env)
    }

    this.log(`✓ "${projectName}/${envName}" configured`)
    this.log('→ Run `wdx project switch` to change active project')
    this.log('→ Run `wdx project switch-env` to change active environment')
  }
}
