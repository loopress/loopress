import {configManager} from '../config/project-config.manager.js'
import {LoopressCommand} from '../lib/base.js'
import {isNotFoundError} from '../lib/wp-client.js'
import {diagnoseWpSite} from '../lib/wp-site-diagnostic.js'

export default class Doctor extends LoopressCommand {
  static description = 'Diagnose connectivity, plugin and credential problems for the targeted environment'
  static examples = ['$ lps doctor', '$ lps doctor --env production']

  async run(): Promise<void> {
    const {name, token, url} = this.siteConfig
    const project = this.localConfig.projectId
      ? configManager.getProject(this.localConfig.projectId)
      : configManager.getCurrentProject()

    this.log(`Project:      ${project?.name ?? '(unknown)'}`)
    this.log(`Environment:  ${name}`)
    this.log(`URL:          ${url}`)
    this.log('')

    let failed = 0

    const reachable = await this.check('WordPress REST API reachable', async () => {
      const diagnostic = await diagnoseWpSite(url)
      if (!diagnostic.ok) throw new Error(diagnostic.reason)
    })
    if (!reachable) {
      failed++
      this.log('- Remaining checks skipped while the site is unreachable.')
      this.error('1 check failed.', {exit: 1})
    }

    if (!token) {
      this.log('✗ Credentials configured')
      this.log(`  No credentials stored for ${url}. Run \`lps project config\` to add them.`)
      this.log('- Remaining checks skipped without credentials.')
      this.error('1 check failed.', {exit: 1})
    }

    // The namespace index answers regardless of which Loopress features are active, so a 404
    // here can only mean the plugin itself is missing or outdated (WpClient's 404 message
    // already says exactly that).
    if (!(await this.check('Loopress plugin installed (loopress/v1 endpoints)', () => this.wp.get('loopress/v1')))) {
      failed++
    }

    // wp/v2/users/me is WordPress core and requires authentication, so it validates the
    // application password without depending on any Loopress feature.
    if (!(await this.check('Credentials accepted (authenticated request)', () => this.wp.get('wp/v2/users/me')))) {
      failed++
    }

    await this.reportPluginVersion()

    this.log('')
    if (failed > 0) {
      this.error(`${failed} check${failed === 1 ? '' : 's'} failed.`, {exit: 1})
    }

    this.log('All checks passed.')
  }

  private async check(title: string, run: () => Promise<unknown>): Promise<boolean> {
    try {
      await run()
      this.log(`✓ ${title}`)
      return true
    } catch (error) {
      this.log(`✗ ${title}`)
      this.log(`  ${(error as Error).message}`)
      return false
    }
  }

  // Informational only: Loopress Light does not expose loopress/v1/update, and an old plugin
  // predates it, neither should flip the doctor to a failure when everything else works.
  private async reportPluginVersion(): Promise<void> {
    try {
      const status = await this.wp.get<{current_version?: string}>('loopress/v1/update')
      this.log(`✓ Plugin version: ${status.current_version ?? '(unknown)'}`)
    } catch (error) {
      if (isNotFoundError(error)) {
        this.log('- Plugin version: not exposed by this plugin edition.')
        return
      }

      this.log(`- Plugin version: could not be read. ${(error as Error).message}`)
    }
  }
}
