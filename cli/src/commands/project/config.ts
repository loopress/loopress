import {confirm, input, password as passwordPrompt, select} from '@inquirer/prompts'
import {Command} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'
import {EnvironmentConfig, ProjectConfig} from '../../config/types.js'

export default class Config extends Command {
  static description = 'Add or update a WordPress project environment'
  static examples = ['$ lps project config']

  async run(): Promise<void> {
    await this.parse(Config)

    const projectName = await input({
      message: 'Project name (identifier, no spaces)',
      validate(value) {
        if (!/^[a-z0-9_-]+$/.test(value)) {
          return 'Name must be lowercase with only letters, numbers, - and _'
        }

        return true
      },
    })

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

    const existingProject = configManager.getProject(projectName)
    const existingEnv = existingProject?.environments[envName]

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

    const url = await input({
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

    const user = await input({
      message: 'Username',
      validate: (value) => (value.trim().length > 0 ? true : 'Username cannot be empty'),
    })

    const appPassword = await passwordPrompt({
      mask: '*',
      message: 'Application password',
      validate: (value) => (value.trim().length > 0 ? true : 'Application password cannot be empty'),
    })

    const token = `${user}:${appPassword}`

    const env: EnvironmentConfig = {
      addedAt: new Date().toISOString(),
      name: envName,
      token,
      url,
    }

    if (existingProject) {
      configManager.setEnvironment(projectName, envName, env)
    } else {
      const project: ProjectConfig = {
        addedAt: new Date().toISOString(),
        currentEnv: envName,
        environments: {[envName]: env},
        name: projectName,
      }
      configManager.setProject(projectName, project)
    }

    this.log(`✓ "${projectName}/${envName}" configured`)
    this.log('→ Run `lps project switch` to change active project')
    this.log('→ Run `lps project switch-env` to change active environment')
  }
}
