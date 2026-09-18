import {Args} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {readdirTolerant} from '../../lib/readdir-tolerant.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {getMenuSlug, type Menu, MENU_ENDPOINT, MENU_LOCATIONS_ENDPOINT, type MenuLocations} from '../../utils/menu-format.js'
import {pluralize} from '../../utils/pluralize.js'

// A menu literally slugged "menu-locations" would still collide, but that's far less likely
// than the plain "locations" this used to be (WordPress's own menu-locations feature).
const LOCATIONS_FILENAME = 'menu-locations.json'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to menus directory (overrides project config)'}),
  }

  static description =
    'Push local nav menus and the active theme menu locations to WordPress. Each menu\'s post_type/taxonomy items are resolved by slug on the target environment, never by a raw id; an item whose target does not exist there fails the whole menu rather than guessing.'

  static examples = ['$ lps menu push']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveMenuPath(args.path)

    this.log(`Pushing nav menus to ${url}`)
    this.log(`Menus path: ${path}`)

    const provider = getResourceStateProvider('menu')
    const beforeState = await this.captureBeforePushState(provider, path)

    await this.pushMenus(path)
    await this.pushLocations(path)

    await this.writeAfterPushSnapshot(provider, path, beforeState)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'menu')} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All nav menus pushed.')
  }

  private async pushLocations(basePath: string): Promise<void> {
    const file = join(basePath, LOCATIONS_FILENAME)
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return

      throw error
    }

    if (this.dryRun) {
      this.log(`[dry-run] Would push: ${file}`)
      return
    }

    try {
      await this.wp.put(MENU_LOCATIONS_ENDPOINT, JSON.parse(raw) as MenuLocations)
      this.log(`Pushed: ${file}`)
    } catch (error) {
      this.failedCount++
      this.warn(`Failed to push ${file}: ${(error as Error).message}`)
    }
  }

  private async pushMenuFile(filePath: string, task?: {output: string}): Promise<void> {
    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${filePath}`

      return
    }

    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not a JSON object')

      const record = parsed as Record<string, unknown>
      const slug = getMenuSlug(record)
      if (slug === null) throw new Error('missing or invalid "slug"')

      const name = typeof record.name === 'string' ? record.name : ''
      const items = record.items ?? []
      if (!Array.isArray(items)) throw new Error('"items" must be an array')

      const result = await this.wp.post<Menu>(MENU_ENDPOINT, {items, name, slug})
      if (task) {
        task.output = result.warnings.length > 0 ? `Pushed: ${slug} (warning: ${result.warnings.join('; ')})` : `Pushed: ${slug}`
      }
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${filePath}: ${(error as Error).message}`, error, task)
    }
  }

  private async pushMenus(basePath: string): Promise<void> {
    const files = (await readdirTolerant(basePath)).filter((file) => extname(file) === '.json' && file !== LOCATIONS_FILENAME)
    if (files.length === 0) return

    this.log(`Found ${pluralize(files.length, 'menu')} to push`)

    await this.runPushTasks(
      files,
      (file) => file,
      async (file, task) => this.pushMenuFile(join(basePath, file), task),
    )
  }
}
