import {configManager} from '../config/project-config.manager.js'
import {LoopressCommand} from '../lib/base.js'
import {isNotFoundError} from '../lib/wp-client.js'
import {diagnoseWpSite} from '../lib/wp-site-diagnostic.js'
import {pluralize} from '../utils/pluralize.js'

export type DoctorCheck = {message?: string; ok: boolean; title: string}

export type DoctorResult = {
  checks: DoctorCheck[]
  environment: string
  ok: boolean
  pluginVersion?: string
  project: string
  url: string
}

export default class Doctor extends LoopressCommand {
  static description = 'Diagnose connectivity, plugin and credential problems for the targeted environment'
  static enableJsonFlag = true
  static examples = ['$ lps doctor', '$ lps doctor --env production']

  private readonly checks: DoctorCheck[] = []

  async run(): Promise<DoctorResult> {
    const {name, token, url} = this.siteConfig
    const project = this.localConfig.projectId
      ? configManager.getProject(this.localConfig.projectId)
      : configManager.getCurrentProject()
    const projectName = project?.name ?? '(unknown)'

    this.out(`Project:      ${projectName}`)
    this.out(`Environment:  ${name}`)
    this.out(`URL:          ${url}`)
    this.out('')

    let pluginVersion: string | undefined

    const isReachable = await this.check('WordPress REST API reachable', async () => {
      const diagnostic = await diagnoseWpSite(url)
      if (!diagnostic.ok) throw new Error(diagnostic.reason)
    })

    if (isReachable) {
      if (token) {
        // The namespace index answers regardless of which Loopress features are active, so a
        // 404 here can only mean the plugin itself is missing or outdated (WpClient's 404
        // message already says exactly that).
        await this.check('Loopress plugin installed (loopress/v1 endpoints)', async () => this.wp.get('loopress/v1'))

        // wp/v2/users/me is WordPress core and requires authentication, so it validates the
        // application password without depending on any Loopress feature.
        await this.check('Credentials accepted (authenticated request)', async () => this.wp.get('wp/v2/users/me'))

        pluginVersion = await this.reportPluginVersion()
      } else {
        this.checks.push({
          message: `No credentials stored for ${url}. Run \`lps project config\` to add them.`,
          ok: false,
          title: 'Credentials configured',
        })
        this.out('✗ Credentials configured')
        this.out(`  No credentials stored for ${url}. Run \`lps project config\` to add them.`)
        this.out('- Remaining checks skipped without credentials.')
      }
    } else {
      this.out('- Remaining checks skipped while the site is unreachable.')
    }

    const failed = this.checks.filter((check) => !check.ok).length
    const ok = failed === 0

    this.out('')
    this.out(ok ? 'All checks passed.' : `${pluralize(failed, 'check')} failed.`)

    if (!ok) process.exitCode = 1

    return {checks: this.checks, environment: name, ok, pluginVersion, project: projectName, url}
  }

  private async check(title: string, run: () => Promise<unknown>): Promise<boolean> {
    try {
      await run()
      this.checks.push({ok: true, title})
      this.out(`✓ ${title}`)
      return true
    } catch (error) {
      const {message} = error as Error
      this.checks.push({message, ok: false, title})
      this.out(`✗ ${title}`)
      this.out(`  ${message}`)
      return false
    }
  }

  private out(message: string): void {
    if (!this.jsonEnabled()) this.log(message)
  }

  // Informational only: Loopress Light does not expose loopress/v1/update, and an old plugin
  // predates it, neither should flip the doctor to a failure when everything else works.
  private async reportPluginVersion(): Promise<string | undefined> {
    try {
      const status = await this.wp.get<{current_version?: string}>('loopress/v1/update')
      const version = status.current_version ?? '(unknown)'
      this.out(`✓ Plugin version: ${version}`)
      return version
    } catch (error) {
      if (isNotFoundError(error)) {
        this.out('- Plugin version: not exposed by this plugin edition.')
        return undefined
      }

      this.out(`- Plugin version: could not be read. ${(error as Error).message}`)
      return undefined
    }
  }
}
