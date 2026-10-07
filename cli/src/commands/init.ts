import {confirm, input, select} from '@inquirer/prompts'
import {Command} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {isInteractive} from '../lib/interactive.js'
import {ensureLfGitattributes, type LoopressLocalConfig, writeLocalConfig} from '../utils/loopress-config.js'

// WordPress.org slugs for the two snippet plugins the Loopress WordPress plugin supports
// (see SnippetModule.php, which wires up both providers and auto-detects the active one).
const SNIPPET_PROVIDERS = [
  {name: 'Code Snippets', slug: 'code-snippets'},
  {name: 'WPCode', slug: 'insert-headers-and-footers'},
]

export default class Init extends Command {
  static description = 'Initialize a loopress.json config file in the current directory'
  static examples = ['$ lps init']

  async run(): Promise<void> {
    await this.parse(Init)

    if (!isInteractive()) {
      this.error(
        'lps init asks its questions interactively and needs a terminal. In CI or scripts, commit a loopress.json instead (see the Getting Started documentation for the file format).',
      )
    }

    const configPath = join(process.cwd(), 'loopress.json')

    if (existsSync(configPath)) {
      const isOverwrite = await confirm({
        default: false,
        message: 'loopress.json already exists. Overwrite?',
      })
      if (!isOverwrite) {
        this.log('Aborted.')
        return
      }
    }

    const {projectId, projectLabel} = await this.resolveProjectChoice()

    const rootDir = await input({
      default: '.',
      message: 'Root directory',
    })

    const providerChoice = await select({
      choices: [...SNIPPET_PROVIDERS.map((p) => ({name: p.name, value: p.slug})), {name: 'None / already installed', value: '__none__'}],
      message: 'Snippet provider',
    })

    // Resource directories are left out on purpose: every command falls back to its default
    // (utils/resource-dirs.ts), and a custom name is a one-line edit in loopress.json.
    const config: LoopressLocalConfig = {projectId, rootDir}

    await writeLocalConfig(config)
    const isGitattributesUpdated = await ensureLfGitattributes()

    let isProviderAdded = false
    if (providerChoice !== '__none__') {
      try {
        await this.config.runCommand('plugin:add', [providerChoice])
        isProviderAdded = true
      } catch (error) {
        this.warn((error as Error).message)
      }
    }

    this.log(`\n✓ loopress.json created`)
    this.log(`  Project:  ${projectLabel}`)
    this.log(`  Root:     ${rootDir}`)

    if (isProviderAdded) {
      this.log(`  Plugin:   ${providerChoice}`)
    }

    if (isGitattributesUpdated) {
      this.log('✓ .gitattributes: LF line endings, so files match across macOS, Linux and Windows')
    }

    this.log('\n→ Next: run `lps pull` to fetch what is already on the site, or `lps doctor` to verify the connection.')
  }

  // When nothing is configured yet, the useful path is configuring a project right here, not
  // typing a project ID that points at nothing. Manual entry stays available as an explicit
  // choice, and as the fallback when the inline `project config` is declined or aborted.
  private async promptManualProjectId(): Promise<{projectId: string; projectLabel: string}> {
    const projectId = await input({
      message: 'Project ID',
      validate: (value) => (value.trim().length > 0 ? true : 'Project ID cannot be empty'),
    })
    return {projectId, projectLabel: projectId}
  }

  private async resolveProjectChoice(): Promise<{projectId: string; projectLabel: string}> {
    let projects = configManager.listProjects()

    if (projects.length === 0) {
      this.log('No projects configured yet.')
      const isRunConfig = await confirm({default: true, message: 'Run `lps project config` now to add one?'})

      if (!isRunConfig) {
        return this.promptManualProjectId()
      }

      await this.config.runCommand('project:config')
      projects = configManager.listProjects()

      if (projects.length === 0) {
        this.log('Still no project configured, falling back to manual entry.')
        return this.promptManualProjectId()
      }

      if (projects.length === 1) {
        return {projectId: projects[0].id, projectLabel: projects[0].name}
      }
    }

    const choice = await select({
      choices: [...projects.map((p) => ({name: p.name, value: p.id})), {name: 'Enter a project ID manually', value: '__manual__'}],
      message: 'WordPress project',
    })

    if (choice === '__manual__') {
      return this.promptManualProjectId()
    }

    return {projectId: choice, projectLabel: projects.find((p) => p.id === choice)!.name}
  }
}
