import {confirm} from '@inquirer/prompts'
import {Command} from '@oclif/core'
import {Listr} from 'listr2'
import slugify from 'slugify'

import {authManager} from '../../config/auth.manager.js'
import {configManager} from '../../config/project-config.manager.js'
import {ApiClient} from '../../lib/api-client.js'
import {EnvironmentConfig, ProjectConfig} from '../../types/config.js'

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

// `action` records what confirm()-driven planning already decided, before any network call is
// made: 'synced' means nothing to do, 'link' just needs a local config write, 'create' needs a
// POST. Splitting planning (interactive) from execution (Listr) is what lets confirm() prompts
// run to completion before the Listr renderer takes over the terminal.
interface EnvPlan {
  action: 'create' | 'link' | 'synced'
  apiEnvironmentId?: string
  env: EnvironmentConfig
  projectId: string
}

interface ProjectPlan {
  action: 'create' | 'link' | 'synced'
  apiProjectId?: string
  project: ProjectConfig & {id: string}
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
    const envPlansByProject = new Map<string, EnvPlan[]>()

    const projectPlans: ProjectPlan[] = []
    for (const project of projects) {
      const plan = await this.planProject(project, apiProjects, claimedProjectIds)
      projectPlans.push(plan)

      const apiProject = plan.apiProjectId ? apiProjects.find((candidate) => candidate.id === plan.apiProjectId) : undefined
      const claimedEnvironmentIds = new Set<string>()
      const envPlans: EnvPlan[] = []

      for (const env of configManager.listEnvironments(project.id)) {
        envPlans.push(
          plan.action === 'create'
            ? {action: 'create', env, projectId: project.id}
            : await this.planEnvironment(env, project.id, apiProject, claimedEnvironmentIds),
        )
      }

      envPlansByProject.set(project.id, envPlans)
    }

    let projectCount = projectPlans.filter((plan) => plan.action === 'synced').length
    let environmentCount = [...envPlansByProject.values()].flat().filter((plan) => plan.action === 'synced').length

    const projectsNeedingWork = projectPlans.filter((plan) => plan.action !== 'synced')
    if (projectsNeedingWork.length > 0) {
      await new Listr(
        projectsNeedingWork.map((plan) => ({
          task: async (_ctx, task) => {
            await this.applyProject(api, plan, task)
            projectCount++
          },
          title:
            plan.action === 'create'
              ? `Create project "${plan.project.name}" on the API`
              : `Link project "${plan.project.name}" to the API`,
        })),
        {concurrent: false, exitOnError: false},
      ).run()
    }

    const envsNeedingWork = projectPlans
      .filter((plan): plan is ProjectPlan & {apiProjectId: string} => Boolean(plan.apiProjectId))
      .flatMap((plan) =>
        (envPlansByProject.get(plan.project.id) ?? [])
          .filter((envPlan) => envPlan.action !== 'synced')
          .map((envPlan) => ({apiProjectId: plan.apiProjectId, envPlan, projectName: plan.project.name})),
      )

    if (envsNeedingWork.length > 0) {
      await new Listr(
        envsNeedingWork.map(({apiProjectId, envPlan, projectName}) => ({
          task: async (_ctx, task) => {
            await this.applyEnvironment(api, apiProjectId, envPlan, task)
            environmentCount++
          },
          title:
            envPlan.action === 'create'
              ? `Create environment "${envPlan.env.name}" on "${projectName}"`
              : `Link environment "${envPlan.env.name}" on "${projectName}"`,
        })),
        {concurrent: false, exitOnError: false},
      ).run()
    }

    for (const plan of projectPlans) {
      if (!plan.apiProjectId) continue

      for (const envPlan of envPlansByProject.get(plan.project.id) ?? []) {
        if (!envPlan.apiEnvironmentId || !envPlan.env.token) continue

        try {
          await this.pushCredentials(api, plan.apiProjectId, envPlan.apiEnvironmentId, envPlan.env)
        } catch (error) {
          this.warn(`Failed to sync "${plan.project.name}/${envPlan.env.name}": ${(error as Error).message}`)
        }
      }
    }

    const newApiProjects = apiProjects.filter((candidate) => !claimedProjectIds.has(candidate.id))
    if (newApiProjects.length > 0) {
      await new Listr(
        newApiProjects.map((apiProject) => ({
          task: async (_ctx, task) => {
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
      `\n✓ Synced ${projectCount} project${projectCount === 1 ? '' : 's'}, ${environmentCount} environment${environmentCount === 1 ? '' : 's'} with your Loopress account`,
    )
  }

  private async applyEnvironment(
    api: ApiClient,
    apiProjectId: string,
    envPlan: EnvPlan,
    task?: {output: string},
  ): Promise<void> {
    try {
      if (envPlan.action === 'create') {
        const created = await api.post<ApiEnvironment>(`projects/${apiProjectId}/environments`, {
          name: envPlan.env.name,
          url: envPlan.env.url,
        })
        envPlan.apiEnvironmentId = created.id
      }

      if (!envPlan.apiEnvironmentId) {
        throw new Error(`No API environment id resolved for "${envPlan.env.name}" (action: ${envPlan.action})`)
      }

      configManager.setEnvironmentApiId(envPlan.projectId, envPlan.env.name, envPlan.apiEnvironmentId)
      if (task) task.output = envPlan.action === 'create' ? 'Created on the API' : 'Linked to the API'
    } catch (error) {
      const message = `Failed to sync "${envPlan.env.name}": ${(error as Error).message}`
      if (task) task.output = message
      throw error
    }
  }

  private async applyProject(api: ApiClient, plan: ProjectPlan, task?: {output: string}): Promise<void> {
    try {
      if (plan.action === 'create') {
        const created = await api.post<ApiProject>('projects', {name: plan.project.name})
        plan.apiProjectId = created.id
      }

      if (!plan.apiProjectId) {
        throw new Error(`No API project id resolved for "${plan.project.name}" (action: ${plan.action})`)
      }

      configManager.setProjectApiId(plan.project.id, plan.apiProjectId)
      if (task) task.output = plan.action === 'create' ? 'Created on the API' : 'Linked to the API'
    } catch (error) {
      const message = `Failed to sync project "${plan.project.name}": ${(error as Error).message}`
      if (task) task.output = message
      throw error
    }
  }

  private async fetchApiProjects(api: ApiClient): Promise<ApiProject[]> {
    try {
      return await api.get<ApiProject[]>('projects')
    } catch (error) {
      this.warn(`Could not fetch existing projects from the API, will create everything as new: ${(error as Error).message}`)
      return []
    }
  }

  private async planEnvironment(
    env: EnvironmentConfig,
    projectId: string,
    apiProject: ApiProject | undefined,
    claimedEnvironmentIds: Set<string>,
  ): Promise<EnvPlan> {
    if (env.apiEnvironmentId) {
      claimedEnvironmentIds.add(env.apiEnvironmentId)
      return {action: 'synced', apiEnvironmentId: env.apiEnvironmentId, env, projectId}
    }

    const match = apiProject?.environments.find(
      (candidate) => candidate.name === env.name && !claimedEnvironmentIds.has(candidate.id),
    )

    if (match) {
      const link = await confirm({
        default: true,
        message: `Environment "${env.name}" already exists on "${apiProject?.name}". Link to it instead of creating a new one?`,
      })

      if (link) {
        claimedEnvironmentIds.add(match.id)
        return {action: 'link', apiEnvironmentId: match.id, env, projectId}
      }
    }

    return {action: 'create', env, projectId}
  }

  private async planProject(
    project: ProjectConfig & {id: string},
    apiProjects: ApiProject[],
    claimedProjectIds: Set<string>,
  ): Promise<ProjectPlan> {
    if (project.apiProjectId) {
      claimedProjectIds.add(project.apiProjectId)
      return {action: 'synced', apiProjectId: project.apiProjectId, project}
    }

    const slug = slugify(project.name, {lower: true, strict: true})
    const match = apiProjects.find((candidate) => candidate.slug === slug && !claimedProjectIds.has(candidate.id))

    if (match) {
      const link = await confirm({
        default: true,
        message: `A project named "${project.name}" already exists on your account. Link to it instead of creating a new one?`,
      })

      if (link) {
        claimedProjectIds.add(match.id)
        return {action: 'link', apiProjectId: match.id, project}
      }
    }

    return {action: 'create', project}
  }

  private pullProject(apiProject: ApiProject, task?: {output: string}): void {
    // Reuse a local project already linked to this API project instead of always minting a
    // new one: otherwise every sync run that can't "claim" an existing link (e.g. after the
    // local config was reset or desynced from the API) creates yet another duplicate entry.
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

  private async pushCredentials(
    api: ApiClient,
    apiProjectId: string,
    apiEnvironmentId: string,
    env: EnvironmentConfig,
  ): Promise<void> {
    if (!env.token) return

    const [username, ...rest] = env.token.split(':')
    await api.put(`projects/${apiProjectId}/environments/${apiEnvironmentId}/credentials`, {
      password: rest.join(':'),
      username,
    })
  }
}
