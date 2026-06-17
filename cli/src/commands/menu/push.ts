import {Flags} from '@oclif/core'
import got from 'got'
import fs from 'node:fs/promises'
import path from 'node:path'

import {NavMenu} from '../../types/menu.js'
import {WordpressDXCommand} from '../base.js'

export default class Push extends WordpressDXCommand {
  static description = 'Push Menus to WordPress'
  static examples = ['$ wdx menu push', '$ wdx menu push --url http://example.com']
  static flags = {
    ...WordpressDXCommand.baseFlags,
    config: Flags.string({default: 'menus.json', description: 'Config file to read menus from'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Push)
    const {config} = flags as {config: string}
    const {url} = this.siteConfig

    const configPath = path.resolve(process.cwd(), config)

    try {
      const data = await fs.readFile(configPath, 'utf8')
      const navigations = JSON.parse(data) as NavMenu[]

      this.log(`🚀 Pushing ${navigations.length} menus to ${url}`)

      const headers = await this.buildAuthHeaders()

      for (const nav of navigations) {
        this.log(`🔄 Pushing menu: ${nav.name} (ID: ${nav.id})`)

        await got.put(`${url}/wp-json/wp/v2/navigation/${nav.id}`, {headers, json: nav})

        this.log(`✅ Updated ${nav.name}`)
      }

      this.log('🎉 All menus pushed successfully!')
    } catch (error) {
      this.error(`❌ Error pushing menus: ${(error as Error).message}`)
    }
  }
}
