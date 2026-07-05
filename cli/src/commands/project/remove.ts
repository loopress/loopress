import {checkbox} from '@inquirer/prompts'
import {Command} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'

type RemovalTarget =
  | {env: string; kind: 'env'; projectId: string; projectName: string}
  | {kind: 'project'; projectId: string; projectName: string}

export default class Remove extends Command {
  static description = 'Remove one or more WordPress projects or environments'
  static examples = ['$ lps project remove']

  async run(): Promise<void> {
    await this.parse(Remove)

    const projects = configManager.listProjects()

    if (projects.length === 0) {
      this.error('No projects configured.')
    }

    const targets: RemovalTarget[] = []
    const choices = projects.flatMap((project) => {
      const envCount = Object.keys(project.environments).length
      const envLabel = `${envCount} env${envCount > 1 ? 's' : ''}`
      const currentMarker = project.isCurrent ? ' [current]' : ''

      targets.push({kind: 'project', projectId: project.id, projectName: project.name})
      const projectChoice = {
        description: 'Also removes all its environments below.',
        name: `${project.name.padEnd(20)} (${envLabel})${currentMarker}`,
        value: String(targets.length - 1),
      }

      const envChoices = configManager.listEnvironments(project.id).map((env) => {
        targets.push({env: env.name, kind: 'env', projectId: project.id, projectName: project.name})
        return {
          name: `    ${env.name.padEnd(20)} ${env.url}${env.isCurrent ? ' [current]' : ''}`,
          value: String(targets.length - 1),
        }
      })

      return [projectChoice, ...envChoices]
    })

    const chosen = await checkbox({
      choices,
      message: 'Select projects or environments to remove',
    })

    if (chosen.length === 0) {
      this.log('Nothing removed.')
      return
    }

    const selected = chosen.map((index) => targets[Number(index)])
    const projectsToRemove = new Map(
      selected.filter((target) => target.kind === 'project').map((target) => [target.projectId, target.projectName]),
    )
    const envsToRemove = selected.filter(
      (target): target is Extract<RemovalTarget, {kind: 'env'}> =>
        target.kind === 'env' && !projectsToRemove.has(target.projectId),
    )

    for (const projectId of projectsToRemove.keys()) configManager.removeProject(projectId)
    for (const {env, projectId} of envsToRemove) configManager.removeEnvironment(projectId, env)

    const removedLabels = [
      ...projectsToRemove.values(),
      ...envsToRemove.map(({env, projectName}) => `${projectName}/${env}`),
    ]

    this.log(`✓ Removed: ${removedLabels.join(', ')}`)
  }
}
