import {Command} from '@oclif/core'
import {Listr} from 'listr2'

import {authManager} from '../../config/auth.manager.js'
import {configManager} from '../../config/project-config.manager.js'
import {ApiClient} from '../../lib/api-client.js'
import {errorMessage} from '../../lib/narrow.js'
import {withoutSpinner} from '../../lib/spinner.js'
import {type EnvironmentConfig} from '../../types/config.js'
import {isEnvironmentType} from '../../types/environment-type.js'
import {pluralize} from '../../utils/pluralize.js'

type ApiEnvironment = {
  createdAt: string
  id: string
  name: string
  type?: string
  url: string
}

type ApiProject = {
  createdAt: string
  environments: ApiEnvironment[]
  id: string
  name: string
  slug: string
}

export default class Import extends Command {
  static override description = 'Import projects and environments from your Loopress account that are not configured locally yet'
  static override examples = ['$ lps project import']

  async run(): Promise<void> {
    await this.parse(Import)

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
      await withoutSpinner(async () => {
        await new Listr(
          newApiProjects.map((apiProject) => ({
            task: (_ctx, task) => {
              this.importProject(apiProject, task)
              projectCount++
              environmentCount += apiProject.environments.length
            },
            title: `Import project "${apiProject.name}" from the API`,
          })),
          {concurrent: false, exitOnError: false},
        ).run()
      })
    }

    this.log(
      `\n✓ Imported ${pluralize(projectCount, 'project')}, ${pluralize(environmentCount, 'environment')} from your Loopress account`,
    )

    if (environmentCount > 0) {
      this.log('Imported environments hold no app password, the cloud stores none. Run `lps project config` for each one.')
    }
  }

  private async fetchApiProjects(api: ApiClient): Promise<ApiProject[]> {
    try {
      return await api.get<ApiProject[]>('projects')
    } catch (error) {
      this.error(`Could not fetch projects from the API: ${errorMessage(error)}`)
    }
  }

  // Reuse a local project already linked to this API project instead of always minting a new
  // one: otherwise every import that can't "claim" an existing link (e.g. after the local config
  // was reset or desynced from the API) creates yet another duplicate entry.
  private importProject(apiProject: ApiProject, task?: {output: string}): void {
    const existing = configManager.findProjectByApiId(apiProject.id)
    const environments: Record<string, EnvironmentConfig> = {...existing?.environments}

    for (const env of apiProject.environments) {
      // The API's environment name is still one of the three types until it stores a type of its own.
      const type = environments[env.name]?.type ?? [env.type, env.name].find((candidate) => isEnvironmentType(candidate))
      if (!isEnvironmentType(type)) continue
      environments[env.name] = {
        ...environments[env.name],
        addedAt: environments[env.name]?.addedAt ?? env.createdAt,
        apiEnvironmentId: env.id,
        name: env.name,
        type,
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
    if (task) task.output = `Imported with ${pluralize(envCount, 'environment')}`
  }
}
