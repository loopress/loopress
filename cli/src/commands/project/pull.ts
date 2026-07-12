import {Command} from '@oclif/core'
import {Listr} from 'listr2'

import {authManager} from '../../config/auth.manager.js'
import {configManager} from '../../config/project-config.manager.js'
import {ApiClient} from '../../lib/api-client.js'
import {EnvironmentConfig} from '../../types/config.js'

interface ApiEnvironment {
  createdAt: string
  id: string
  name: string
  url: string
}

interface ApiProject {
  createdAt: string
  environments: ApiEnvironment[]
  id: string
  name: string
  slug: string
}

export default class Pull extends Command {
  static description = 'Pull projects and environments from your Loopress account that are not configured locally yet'
  static examples = ['$ lps project pull']

  async run(): Promise<void> {
    await this.parse(Pull)

    const token = authManager.getAuth()?.token
    if (!token) {
      this.error('Not logged in. Run `lps login` first.')
    }

    const api = new ApiClient(token)
    const apiProjects = await this.fetchApiProjects(api)

    const linkedApiProjectIds = new Set(
      configManager
        .listProjects()
        .map((project) => project.apiProjectId)
        .filter((id): id is string => id !== undefined),
    )
    const newApiProjects = apiProjects.filter((apiProject) => !linkedApiProjectIds.has(apiProject.id))

    let projectCount = 0
    let environmentCount = 0

    if (newApiProjects.length > 0) {
      await new Listr(
        newApiProjects.map((apiProject) => ({
          task: (_ctx, task) => {
            this.pullProject(apiProject, task)
            projectCount++
            environmentCount += apiProject.environments.length
          },
          title: `Pull project "${apiProject.name}" from the API`,
        })),
        {concurrent: false, exitOnError: false},
      ).run()
    }

    this.log(
      `\n✓ Pulled ${projectCount} project${projectCount === 1 ? '' : 's'}, ${environmentCount} environment${environmentCount === 1 ? '' : 's'} from your Loopress account`,
    )
  }

  private async fetchApiProjects(api: ApiClient): Promise<ApiProject[]> {
    try {
      return await api.get<ApiProject[]>('projects')
    } catch (error) {
      this.error(`Could not fetch projects from the API: ${(error as Error).message}`)
    }
  }

  // Reuse a local project already linked to this API project instead of always minting a new
  // one: otherwise every pull that can't "claim" an existing link (e.g. after the local config
  // was reset or desynced from the API) creates yet another duplicate entry.
  private pullProject(apiProject: ApiProject, task?: {output: string}): void {
    const existing = configManager.findProjectByApiId(apiProject.id)
    const environments: Record<string, EnvironmentConfig> = {...existing?.environments}

    for (const env of apiProject.environments) {
      environments[env.name] = {
        ...environments[env.name],
        addedAt: environments[env.name]?.addedAt ?? env.createdAt,
        apiEnvironmentId: env.id,
        name: env.name,
        url: env.url,
      }
    }

    configManager.setProject(existing?.id ?? configManager.createProjectId(apiProject.name), {
      addedAt: existing?.addedAt ?? apiProject.createdAt,
      apiProjectId: apiProject.id,
      environments,
      name: apiProject.name,
    })

    const envCount = apiProject.environments.length
    if (task) task.output = `Pulled with ${envCount} environment${envCount === 1 ? '' : 's'}`
  }
}
