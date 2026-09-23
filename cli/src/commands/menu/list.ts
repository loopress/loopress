import {LoopressCommand} from '../../lib/base.js'
import {type Menu, MENU_ENDPOINT, MENU_LOCATIONS_ENDPOINT, type MenuItem, type MenuLocations} from '../../utils/menu-format.js'

type ListResult = {
  locations: MenuLocations
  menus: Menu[]
}

function countItems(items: MenuItem[]): number {
  return items.reduce((total, item) => total + 1 + countItems(item.children), 0)
}

export default class List extends LoopressCommand {
  static description = 'List nav menus and the active theme menu locations on WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps menu list']

  async run(): Promise<ListResult> {
    const menus = await this.wp.get<Menu[]>(MENU_ENDPOINT)
    const locations = await this.wp.get<MenuLocations>(MENU_LOCATIONS_ENDPOINT)

    if (menus.length === 0) {
      this.log('(no menus)')
    }

    for (const menu of menus) {
      this.log(`${menu.slug} (${menu.name}): ${countItems(menu.items)} item(s)`)
      for (const warning of menu.warnings) this.warn(`${menu.slug}: ${warning}`)
    }

    this.log('')
    this.log('locations:')
    const entries = Object.entries(locations)
    if (entries.length === 0) {
      this.log('  (none registered by the active theme)')
    }

    for (const [location, slug] of entries) {
      this.log(`  ${location}: ${slug ?? '(unassigned)'}`)
    }

    return {locations, menus}
  }
}
