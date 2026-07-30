import {configManager} from '../../config/project-config.manager.js'
import {LoopressCommand} from '../../lib/base.js'
import {rotateAppPassword} from '../../lib/rotate-app-password.js'

export default class Rotate extends LoopressCommand {
  static description = 'Rotate the WordPress application password for the current (or --env) environment'
  static examples = ['$ lps project rotate', '$ lps project rotate --env staging']

  // The rotation above always runs, regardless of age; the background age-check in
  // LoopressCommand would just redo the same work a second time right after.
  protected async maybeAutoRotate(): Promise<void> {}

  async run(): Promise<void> {
    const {name, token, url} = this.siteConfig
    if (!token) {
      this.error(`No credentials configured for ${url}. Run \`lps project config\` first.`)
    }

    this.log(`Rotating application password for ${url}...`)
    const rotated = await rotateAppPassword({...this.siteConfig, token})
    configManager.setEnvironment(this.projectId, name, rotated)

    this.log('✓ New application password created and verified, previous one revoked.')
  }
}
