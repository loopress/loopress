import {Args} from '@oclif/core'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {basenameKey, findOrphanedFiles} from '../../lib/find-orphaned-files.js'
import {type Menu, MENU_ENDPOINT, MENU_LOCATIONS_ENDPOINT, type MenuLocations} from '../../utils/menu-format.js'

// The reserved local filename for menu locations (see pullLocations()): a menu genuinely slugged
// "menu-locations" would collide with it, so it's skipped rather than silently overwriting that file.
const LOCATIONS_FILE_BASENAME = 'menu-locations'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to menus directory (overrides project config)'}),
  }

  static description = 'Pull nav menus and the active theme menu locations from WordPress'
  static examples = ['$ lps menu pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveMenuPath(args.path)

    this.log(`Pulling nav menus from ${url}`)
    this.log(`Menus path: ${path}`)

    await this.pullMenus(path)
    await this.pullLocations(path)
  }

  private async pullLocations(basePath: string): Promise<void> {
    const file = join(basePath, `${LOCATIONS_FILE_BASENAME}.json`)
    const locations = await this.wp.get<MenuLocations>(MENU_LOCATIONS_ENDPOINT)

    if (this.dryRun) {
      this.log(`[dry-run] Would pull locations to ${file}`)
      return
    }

    await mkdir(basePath, {recursive: true})
    await writeFile(file, JSON.stringify(locations, null, 2) + '\n')
    this.log(`Pulled locations to ${file}`)
  }

  private async pullMenus(dir: string): Promise<void> {
    const fetched = await this.wp.get<Menu[]>(MENU_ENDPOINT)
    const remote = fetched.filter((menu) => {
      if (menu.slug === LOCATIONS_FILE_BASENAME) {
        this.warn(`Skipping menu "${menu.slug}": this filename is reserved for ${LOCATIONS_FILE_BASENAME}.json`)
        return false
      }

      return true
    })

    const orphans = await findOrphanedFiles(dir, new Set(remote.map((menu) => menu.slug)), {
      extensions: ['.json'],
      key: (base) => (base === LOCATIONS_FILE_BASENAME ? null : basenameKey(base)),
    })

    await this.pullDirectory(dir, remote, orphans, {
      dryRunMessage: `Would pull ${remote.length} menu(s) to ${dir}`,
      orphanReason: `in ${dir} no longer present on WordPress`,
      pulledMessage: `Pulled ${remote.length} menu(s) to ${dir}`,
      title: (menu) => menu.slug,
      // revision/warnings are server bookkeeping, never part of the tracked configuration (see
      // their doc comments on Menu in menu-format.ts): never persisted locally.
      async write(menu, writeDir) {
        const local: Pick<Menu, 'items' | 'name' | 'slug'> = {items: menu.items, name: menu.name, slug: menu.slug}
        await writeFile(join(writeDir, `${menu.slug}.json`), JSON.stringify(local, null, 2) + '\n')
      },
    })

    if (this.dryRun) return

    for (const menu of remote) {
      for (const warning of menu.warnings) this.warn(`${menu.slug}: ${warning}`)
    }
  }
}
