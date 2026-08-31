import {confirm} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {Buffer} from 'node:buffer'
import {existsSync} from 'node:fs'
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

import {APP_CONFIG_FILENAME, type AppEntry, type AppFile} from '../../lib/app-manifest.js'
import {LoopressCommand} from '../../lib/base.js'
import {isInteractive} from '../../lib/interactive.js'
import {pluralize} from '../../utils/pluralize.js'

type RemoteManifest = {
  buildId: string
  entry: AppEntry
  files: AppFile[]
  mountSelector: string
  name: string
  routing: string
}

type PulledApp = {
  files: number
  name: string
}

type PullResult = {
  orphans: string[]
  pulled: PulledApp[]
  status: 'dry-run' | 'success'
}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to apps directory (overrides project config)'}),
  }

  static description = 'Pull single-page app bundles from WordPress into local files'
  static enableJsonFlag = true
  static examples = ['$ lps app pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<PullResult> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveAppsPath(args.path)

    this.log(`Pulling apps from ${url}`)
    this.log(`Apps path: ${path}`)

    const remoteApps = await this.wp.get<Array<{committed: boolean; name: string}>>('loopress/v1/apps')
    const pullable = remoteApps.filter((app) => app.committed)

    const orphans = await this.findOrphanApps(path, new Set(pullable.map((app) => app.name)))

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${pluralize(pullable.length, 'app')} to ${path}`)
      if (orphans.length > 0) {
        this.log(`[dry-run] Would remove ${pluralize(orphans.length, 'local app')}: ${orphans.join(', ')}`)
      }

      return {orphans, pulled: pullable.map((app) => ({files: 0, name: app.name})), status: 'dry-run'}
    }

    const pulled: PulledApp[] = []
    for (const app of pullable) {
      pulled.push(await this.pullApp(path, app.name))
    }

    await this.removeOrphanApps(path, orphans)

    this.log(`Pulled ${pluralize(pulled.length, 'app')} to ${path}`)
    return {orphans, pulled, status: 'success'}
  }

  private async findOrphanApps(path: string, keep: Set<string>): Promise<string[]> {
    let entries
    try {
      entries = await readdir(path, {withFileTypes: true})
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(path, name, APP_CONFIG_FILENAME)) && !keep.has(name))
  }

  private async pullApp(path: string, name: string): Promise<PulledApp> {
    const manifest = await this.wp.get<RemoteManifest>(`loopress/v1/apps/${name}/manifest`)
    const distDir = join(path, name, 'dist')

    for (const file of manifest.files) {
      const {content} = await this.wp.get<{content: string}>(
        `loopress/v1/apps/${name}/asset?path=${encodeURIComponent(file.path)}`,
      )
      const target = join(distDir, file.path)
      await mkdir(dirname(target), {recursive: true})
      await writeFile(target, Buffer.from(content, 'base64'))
    }

    await writeFile(
      join(path, name, APP_CONFIG_FILENAME),
      JSON.stringify(
        {assetsDir: 'dist', mountSelector: manifest.mountSelector, name: manifest.name, routing: manifest.routing},
        null,
        2,
      ) + '\n',
    )

    this.log(`  ${name}: ${pluralize(manifest.files.length, 'file')} (build ${manifest.buildId})`)
    return {files: manifest.files.length, name}
  }

  private async removeOrphanApps(path: string, orphans: string[]): Promise<void> {
    if (orphans.length === 0) return

    const description = `${pluralize(orphans.length, 'local app')} no longer on WordPress: ${orphans.join(', ')}`

    if (!this.yes && isInteractive()) {
      const isProceed = await confirm({default: true, message: `Remove ${description}?`})
      if (!isProceed) {
        this.log(`Kept ${description}`)
        return
      }
    }

    for (const name of orphans) await rm(join(path, name), {force: true, recursive: true})

    if (this.yes || isInteractive()) {
      this.log(`Removed ${description}`)
    } else {
      this.warn(`Removed ${description}`)
    }
  }
}
