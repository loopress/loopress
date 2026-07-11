import {confirm, input, select} from '@inquirer/prompts'
import {Command} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {LoopressLocalConfig, writeLocalConfig} from '../utils/loopress-config.js'

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

    const configPath = join(process.cwd(), 'loopress.json')

    if (existsSync(configPath)) {
      const overwrite = await confirm({
        default: false,
        message: 'loopress.json already exists. Overwrite?',
      })
      if (!overwrite) {
        this.log('Aborted.')
        return
      }
    }

    const projects = configManager.listProjects()

    let projectId: string
    let projectLabel: string

    if (projects.length > 0) {
      const choices = [
        ...projects.map((p) => ({name: p.name, value: p.id})),
        {name: 'Enter a project ID manually', value: '__manual__'},
      ]

      const choice = await select({
        choices,
        message: 'WordPress project',
      })

      if (choice === '__manual__') {
        projectId = await input({
          message: 'Project ID',
          validate: (value) => (value.trim().length > 0 ? true : 'Project ID cannot be empty'),
        })
        projectLabel = projectId
      } else {
        projectId = choice
        projectLabel = projects.find((p) => p.id === choice)!.name
      }
    } else {
      this.log('No projects configured yet. Run `lps project config` to add one first.')
      projectId = await input({
        message: 'Project ID',
        validate: (value) => (value.trim().length > 0 ? true : 'Project ID cannot be empty'),
      })
      projectLabel = projectId
    }

    const rootDir = await input({
      default: '.',
      message: 'Root directory',
    })

    const snippetsDir = await input({
      default: 'snippets',
      message: 'Snippets directory (relative to root)',
    })

    const providerChoice = await select({
      choices: [...SNIPPET_PROVIDERS.map((p) => ({name: p.name, value: p.slug})), {name: 'None / already installed', value: '__none__'}],
      message: 'Snippet provider',
    })

    const config: LoopressLocalConfig = {
      projectId,
      rootDir,
      snippetsDir,
    }

    await writeLocalConfig(config)

    let providerAdded = false
    if (providerChoice !== '__none__') {
      try {
        await this.config.runCommand('plugin:add', [providerChoice])
        providerAdded = true
      } catch (error) {
        this.warn((error as Error).message)
      }
    }

    this.log(`\n✓ loopress.json created`)
    this.log(`  Project:  ${projectLabel}`)
    this.log(`  Snippets: ${join(rootDir, snippetsDir)}`)
    if (providerAdded) {
      this.log(`  Plugin:   ${providerChoice}`)
    }
  }
}
