import {configManager} from '../../config/project-config.manager.js'
import {LoopressCommand} from '../../lib/base.js'
import {type LoopressConfig} from '../../types/config.js'

export default class Export extends LoopressCommand {
  static override description =
    'Print a config.json holding only the current project and one environment, to store as a CI secret (--env is required)'

  static override examples = ['$ lps project export --env staging', '$ lps project export --env production | gh secret set LOOPRESS_CONFIG']

  // Only reads the config: no rotation, no site call.
  protected override async maybeAutoRotate(): Promise<void> {}

  async run(): Promise<void> {
    const {flags} = await this.parse(Export)
    if (!flags.env) {
      this.error(`Pass --env to pick the environment to export. Available: ${this.projectEnvironments.map((env) => env.name).join(', ')}`)
    }

    const project = configManager.getProject(this.projectId)
    if (!project) this.error(`Project "${this.projectId}" not found.`)

    const exported: LoopressConfig = {
      currentProject: {id: this.projectId},
      projects: {[this.projectId]: {...project, environments: {[this.siteConfig.name]: this.siteConfig}}},
    }

    if (process.stdout.isTTY) {
      process.stderr.write('Warning: this output contains a credential. Pipe it to your CI secret store, do not paste it anywhere else.\n')
    }

    process.stdout.write(`${JSON.stringify(exported, null, 2)}\n`)
  }
}
