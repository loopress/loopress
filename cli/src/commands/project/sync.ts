import {confirm} from '@inquirer/prompts'
import {Command} from '@oclif/core'
import slugify from 'slugify'

import {authManager} from '../../config/auth.manager.js'
import {configManager} from '../../config/project-config.manager.js'
import {ApiClient} from '../../lib/api-client.js'
import {EnvironmentConfig, ProjectConfig} from '../../types/config.js'

interface ApiEnvironment {
  id: string
  name: string
}

interface ApiProject {
  environments: ApiEnvironment[]
  id: string
  name: string
  slug: string
}

export default class Sync extends Command {
  static description = 'Sync locally configured projects and environments with your Loopress account'
  static examples = ['$ lps project sync']

  async run(): Promise<void> {
    await this.parse(Sync)

    const token = authManager.getAuth()?.token
    if (!token) {
      this.error('Not logged in. Run `lps login` first.')
    }

    const projects = configManager.listProjects()
    if (projects.length === 0) {
      this.log('No projects configured. Run `lps project config` first.')
      return
    }

    const api = new ApiClient(token)
    const apiProjects = await this.fetchApiProjects(api)
    const claimedProjectIds = new Set<string>()
    let projectCount = 0
    let environmentCount = 0

    for (const project of projects) {
      try {
        const apiProjectId =
          project.apiProjectId ?? (await this.syncProject(api, project, apiProjects, claimedProjectIds))
        const apiProject = apiProjects.find((candidate) => candidate.id === apiProjectId)
        const claimedEnvironmentIds = new Set<string>()

        for (const env of configManager.listEnvironments(project.id)) {
          try {
            await this.syncEnvironment({api, apiProject, apiProjectId, claimedEnvironmentIds, env, projectId: project.id})
            environmentCount++
          } catch (error) {
            this.warn(`Failed to sync "${project.name}/${env.name}": ${(error as Error).message}`)
          }
        }

        projectCount++
      } catch (error) {
        this.warn(`Failed to sync project "${project.name}": ${(error as Error).message}`)
      }
    }

    this.log(
      `\n✓ Synced ${projectCount} project${projectCount === 1 ? '' : 's'}, ${environmentCount} environment${environmentCount === 1 ? '' : 's'} with your Loopress account`,
    )
  }

  private async fetchApiProjects(api: ApiClient): Promise<ApiProject[]> {
    try {
      return await api.get<ApiProject[]>('projects')
    } catch (error) {
      this.warn(`Could not fetch existing projects from the API, will create everything as new: ${(error as Error).message}`)
      return []
    }
  }

  private async syncEnvironment(options: {
    api: ApiClient
    apiProject: ApiProject | undefined
    apiProjectId: string
    claimedEnvironmentIds: Set<string>
    env: EnvironmentConfig
    projectId: string
  }): Promise<void> {
    const {api, apiProject, apiProjectId, claimedEnvironmentIds, env, projectId} = options
    let {apiEnvironmentId} = env

    if (!apiEnvironmentId) {
      const match = apiProject?.environments.find(
        (candidate) => candidate.name === env.name && !claimedEnvironmentIds.has(candidate.id),
      )

      if (match) {
        const link = await confirm({
          default: true,
          message: `Environment "${env.name}" already exists on "${apiProject?.name}". Link to it instead of creating a new one?`,
        })

        if (link) {
          apiEnvironmentId = match.id
          claimedEnvironmentIds.add(match.id)
          configManager.setEnvironmentApiId(projectId, env.name, apiEnvironmentId)
          this.log(`  ✓ Environment "${env.name}" linked to the API`)
        }
      }

      if (!apiEnvironmentId) {
        const created = await api.post<ApiEnvironment>(`projects/${apiProjectId}/environments`, {
          name: env.name,
          url: env.url,
        })
        apiEnvironmentId = created.id
        configManager.setEnvironmentApiId(projectId, env.name, apiEnvironmentId)
        this.log(`  ✓ Environment "${env.name}" created on the API`)
      }
    }

    if (env.token) {
      const [username, ...rest] = env.token.split(':')
      await api.put(`projects/${apiProjectId}/environments/${apiEnvironmentId}/credentials`, {
        password: rest.join(':'),
        username,
      })
    }
  }

  private async syncProject(
    api: ApiClient,
    project: ProjectConfig & {id: string},
    apiProjects: ApiProject[],
    claimedProjectIds: Set<string>,
  ): Promise<string> {
    const slug = slugify(project.name, {lower: true, strict: true})
    const match = apiProjects.find((candidate) => candidate.slug === slug && !claimedProjectIds.has(candidate.id))

    if (match) {
      const link = await confirm({
        default: true,
        message: `A project named "${project.name}" already exists on your account. Link to it instead of creating a new one?`,
      })

      if (link) {
        claimedProjectIds.add(match.id)
        configManager.setProjectApiId(project.id, match.id)
        this.log(`✓ Project "${project.name}" linked to the API`)
        return match.id
      }
    }

    const created = await api.post<ApiProject>('projects', {name: project.name})
    claimedProjectIds.add(created.id)
    configManager.setProjectApiId(project.id, created.id)
    this.log(`✓ Project "${project.name}" created on the API`)
    return created.id
  }
}
