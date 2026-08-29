import {authManager} from '../config/auth.manager.js'
import {configManager} from '../config/project-config.manager.js'
import {type LoopressLocalConfig, readLocalConfig} from '../utils/loopress-config.js'

type LinkedProject = {
  apiProjectId: string
  localConfig: LoopressLocalConfig
  token: string
}

// Shared preamble for `api publish` and `snippet publish`. Both target the Loopress cloud (never
// a WordPress site), so neither extends `LoopressCommand`/`PushCommand` and neither needs an
// environment resolved, but both need a logged-in user and a project already linked to the
// account (`lps project push`). `fail` is the caller's `this.error`, so its messages keep
// oclif's formatting and exit code; typed `=> never` so callers still narrow after the guards.
export async function resolveLinkedProject(fail: (message: string) => never): Promise<LinkedProject> {
  const token = process.env.LOOPRESS_TOKEN ?? authManager.getAuth()?.token
  if (!token) {
    fail('Not logged in. Run `lps login` first.')
  }

  const localConfig = await readLocalConfig()
  const projectId = localConfig.projectId ?? configManager.getCurrentProject()?.id
  if (!projectId) {
    fail('No project configured. Run `lps project config` first.')
  }

  const project = configManager.getProject(projectId)
  if (!project) {
    fail(`Project "${projectId}" (from loopress.json) not found. Run \`lps project config\` to configure it.`)
  }

  if (!project.apiProjectId) {
    fail(`Project "${project.name}" is not linked to your Loopress account yet. Run \`lps project push\` first.`)
  }

  return {apiProjectId: project.apiProjectId, localConfig, token}
}
