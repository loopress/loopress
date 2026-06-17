import {Flags} from '@oclif/core'
import got from 'got'
import fs from 'node:fs/promises'
import path from 'node:path'

import {NavMenu} from '../../types/menu.js'
import {LoopressCommand} from '../base.js'

export default class Pull extends LoopressCommand {
  static description = 'Pull Menus from WordPress'
  static examples = ['$ lps menu pull', '$ lps menu pull --url http://example.com']
  static flags = {
    ...LoopressCommand.baseFlags,
    config: Flags.string({default: 'menus.json', description: 'Config file to save menus to'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Pull)
    const {config} = flags as {config: string}
    const {url} = this.siteConfig

    this.log(`📥 Pulling Menus from ${url}`)

    try {
      const headers = await this.buildAuthHeaders()
      const response = (await got
        .get(`${url}/wp-json/wp/v2/navigation`, {headers})
        .json()) as NavMenu[]

      const configPath = path.resolve(process.cwd(), config)
      await fs.writeFile(configPath, JSON.stringify(response, null, 2))

      this.log(`✅ Successfully pulled ${response.length} menus to ${config}`)
    } catch (error) {
      this.error(`❌ Error pulling menus: ${(error as Error).message}`)
    }
  }
}
