import {confirm, input, select} from '@inquirer/prompts'
import {Command} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {LoopressLocalConfig, writeLocalConfig} from '../utils/loopress-config.js'

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

    if (projects.length > 0) {
      const choices = [
        ...projects.map((p) => ({name: p.name, value: p.name})),
        {name: 'Enter a project ID manually', value: '__manual__'},
      ]

      const choice = await select({
        choices,
        message: 'WordPress project',
      })

      projectId = choice === '__manual__' ? (await input({
          message: 'Project ID',
          validate: (value) => (value.trim().length > 0 ? true : 'Project ID cannot be empty'),
        })) : choice;
    } else {
      this.log('No projects configured yet. Run `lps project config` to add one first.')
      projectId = await input({
        message: 'Project ID',
        validate: (value) => (value.trim().length > 0 ? true : 'Project ID cannot be empty'),
      })
    }

    const snippetPlugin = await select({
      choices: [
        {name: 'WPCode', value: 'wpcode'},
        {name: 'Code Snippets', value: 'code-snippets'},
      ],
      message: 'Snippet plugin',
    })

    const rootDir = await input({
      default: '.',
      message: 'Root directory',
    })

    const snippetsDir = await input({
      default: 'snippets',
      message: 'Snippets directory (relative to root)',
    })

    const config: LoopressLocalConfig = {
      projectId,
      rootDir,
      snippetPlugin: snippetPlugin as 'code-snippets' | 'wpcode',
      snippetsDir,
    }

    await writeLocalConfig(config)

    this.log(`\n✓ loopress.json created`)
    this.log(`  Project:  ${projectId}`)
    this.log(`  Plugin:   ${snippetPlugin}`)
    this.log(`  Snippets: ${join(rootDir, snippetsDir)}`)
  }
}
