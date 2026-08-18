import {confirm} from '@inquirer/prompts'
import {Command} from '@oclif/core'
import {Listr} from 'listr2'

import {authManager} from '../../config/auth.manager.js'
import {configManager} from '../../config/project-config.manager.js'
import {ApiClient} from '../../lib/api-client.js'
import {LoopressCommand} from '../../lib/base.js'
import {isInteractive} from '../../lib/interactive.js'
import {type EnvironmentConfig, type ProjectConfig} from '../../types/config.js'
import {pluralize} from '../../utils/pluralize.js'
import {toSlug} from '../../utils/to-slug.js'

type ApiEnvironment = {
  createdAt: string
  id: string
  name: string
  url: string
}

type ApiProject = {
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
type EnvPlan = {
  action: 'create' | 'link' | 'synced'
  apiEnvironmentId?: string
  env: EnvironmentConfig
  projectId: string
}

type ProjectPlan = {
  action: 'create' | 'link' | 'synced'
  apiProjectId?: string
  project: ProjectConfig & {id: string}
}

export default class Push extends Command {
  static description = 'Push locally configured projects, environments and credentials to your Loopress account'
  static examples = ['$ lps project push']
  static flags = {
    ...LoopressCommand.yesFlag,
  }

  private yes = false

  async run(): Promise<void> {
    const {flags} = await this.parse(Push)
    this.yes = flags.yes

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
    const {envPlansByProject, projectPlans} = await this.planAll(projects, apiProjects)

    let projectCount = projectPlans.filter((plan) => plan.action === 'synced').length
    let environmentCount = [...envPlansByProject.values()].flat().filter((plan) => plan.action === 'synced').length

    const projectsNeedingWork = projectPlans.filter((plan) => plan.action !== 'synced')
    projectCount += await this.applyProjectPlans(api, projectsNeedingWork)

    const envsNeedingWork = this.collectEnvsNeedingWork(projectPlans, envPlansByProject)
    environmentCount += await this.applyEnvironmentPlans(api, envsNeedingWork)

    await this.pushAllCredentials(api, projectPlans, envPlansByProject)

    this.log(
      `\n✓ Pushed ${pluralize(projectCount, 'project')}, ${pluralize(environmentCount, 'environment')} to your Loopress account`,
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
      const message = `Failed to push "${envPlan.env.name}": ${(error as Error).message}`
      if (task) task.output = message
      throw error
    }
  }

  private async applyEnvironmentPlans(
    api: ApiClient,
    envsNeedingWork: Array<{apiProjectId: string; envPlan: EnvPlan; projectName: string}>,
  ): Promise<number> {
    if (envsNeedingWork.length === 0) return 0

    let count = 0
    await new Listr(
      envsNeedingWork.map(({apiProjectId, envPlan, projectName}) => ({
        task: async (_ctx, task) => {
          await this.applyEnvironment(api, apiProjectId, envPlan, task)
          count++
        },
        title:
          envPlan.action === 'create'
            ? `Create environment "${envPlan.env.name}" on "${projectName}"`
            : `Link environment "${envPlan.env.name}" on "${projectName}"`,
      })),
      {concurrent: false, exitOnError: false},
    ).run()

    return count
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
      const message = `Failed to push project "${plan.project.name}": ${(error as Error).message}`
      if (task) task.output = message
      throw error
    }
  }

  private async applyProjectPlans(api: ApiClient, projectsNeedingWork: ProjectPlan[]): Promise<number> {
    if (projectsNeedingWork.length === 0) return 0

    let count = 0
    await new Listr(
      projectsNeedingWork.map((plan) => ({
        task: async (_ctx, task) => {
          await this.applyProject(api, plan, task)
          count++
        },
        title:
          plan.action === 'create'
            ? `Create project "${plan.project.name}" on the API`
            : `Link project "${plan.project.name}" to the API`,
      })),
      {concurrent: false, exitOnError: false},
    ).run()

    return count
  }

  private collectEnvsNeedingWork(
    projectPlans: ProjectPlan[],
    envPlansByProject: Map<string, EnvPlan[]>,
  ): Array<{apiProjectId: string; envPlan: EnvPlan; projectName: string}> {
    return projectPlans
      .filter((plan): plan is ProjectPlan & {apiProjectId: string} => Boolean(plan.apiProjectId))
      .flatMap((plan) =>
        (envPlansByProject.get(plan.project.id) ?? [])
          .filter((envPlan) => envPlan.action !== 'synced')
          .map((envPlan) => ({apiProjectId: plan.apiProjectId, envPlan, projectName: plan.project.name})),
      )
  }

  // Linking to the existing match is the safe default: outside a TTY (or with --yes) it is
  // taken without prompting, and logged, so CI runs never mint duplicate projects.
  private async confirmLink(message: string): Promise<boolean> {
    if (this.yes || !isInteractive()) {
      this.log(`${message} Assuming yes (link).`)
      return true
    }

    return confirm({default: true, message})
  }

  private async fetchApiProjects(api: ApiClient): Promise<ApiProject[]> {
    try {
      return await api.get<ApiProject[]>('projects')
    } catch (error) {
      this.warn(`Could not fetch existing projects from the API, will create everything as new: ${(error as Error).message}`)
      return []
    }
  }

  private async planAll(
    projects: Array<ProjectConfig & {id: string}>,
    apiProjects: ApiProject[],
  ): Promise<{envPlansByProject: Map<string, EnvPlan[]>; projectPlans: ProjectPlan[]}> {
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

    return {envPlansByProject, projectPlans}
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
      const isLink = await this.confirmLink(
        `Environment "${env.name}" already exists on "${apiProject?.name}". Link to it instead of creating a new one?`,
      )

      if (isLink) {
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

    const slug = toSlug(project.name)
    const match = apiProjects.find((candidate) => candidate.slug === slug && !claimedProjectIds.has(candidate.id))

    if (match) {
      const isLink = await this.confirmLink(
        `A project named "${project.name}" already exists on your account. Link to it instead of creating a new one?`,
      )

      if (isLink) {
        claimedProjectIds.add(match.id)
        return {action: 'link', apiProjectId: match.id, project}
      }
    }

    return {action: 'create', project}
  }

  private async pushAllCredentials(
    api: ApiClient,
    projectPlans: ProjectPlan[],
    envPlansByProject: Map<string, EnvPlan[]>,
  ): Promise<void> {
    for (const plan of projectPlans) {
      if (!plan.apiProjectId) continue

      for (const envPlan of envPlansByProject.get(plan.project.id) ?? []) {
        if (!envPlan.apiEnvironmentId || !envPlan.env.token) continue

        try {
          await this.pushCredentials(api, plan.apiProjectId, envPlan.apiEnvironmentId, envPlan.env)
        } catch (error) {
          this.warn(`Failed to push "${plan.project.name}/${envPlan.env.name}": ${(error as Error).message}`)
        }
      }
    }
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
